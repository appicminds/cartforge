import { HttpStatus, Injectable } from "@nestjs/common";
import {
  CUSTOMER_ERROR_CODES,
  type CommerceAddress,
  type StorefrontCustomer,
} from "@cartforge/types";
import type {
  CustomerAddressInput,
  CustomerProfile,
  CustomerRegister,
} from "@cartforge/validation";
import { PasswordService } from "../../auth/password.service";
import { RateLimitService } from "../../auth/rate-limit.service";
import { generateToken, sha256 } from "../../auth/tokens";
import { AppException } from "../../common/app-exception";
import { Mailer } from "../../mail/mailer";
import { DomainsService } from "../../platform/domains.service";
import { PrismaService } from "../../prisma/prisma.service";

/** Storefront sign-ins last 30 days; reset links 1 hour. */
const SESSION_MS = 30 * 24 * 3600_000;
const LINK_MS = 3600_000;

const invalidLogin = () =>
  new AppException(
    CUSTOMER_ERROR_CODES.INVALID_LOGIN,
    "Email or password is incorrect.",
    HttpStatus.UNAUTHORIZED,
  );
const signedOut = () =>
  new AppException("UNAUTHENTICATED", "Please sign in.", HttpStatus.UNAUTHORIZED);

interface Meta {
  ip?: string;
}

/**
 * Storefront customer accounts (Next 7): sign-up, sign-in, password reset,
 * profile and saved addresses. Separate from staff accounts; one per store.
 * An email that already has guest orders is only claimed through an emailed
 * link, so nobody can read someone else's order history by signing up first.
 */
@Injectable()
export class CustomerAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly rateLimit: RateLimitService,
    private readonly mailer: Mailer,
    private readonly domains: DomainsService,
  ) {}

  // ───────────── Sessions ─────────────

  private async startSession(storeId: string, customerId: string) {
    const token = generateToken(32);
    await this.prisma.customerSession.create({
      data: {
        store_id: storeId,
        customer_id: customerId,
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + SESSION_MS),
      },
    });
    return token;
  }

  /** The signed-in customer for this token, or null. */
  async resolve(storeId: string, token: string | undefined): Promise<string | null> {
    if (!token || token.length > 200) return null;
    const s = await this.prisma.customerSession.findUnique({
      where: { token_hash: sha256(token) },
    });
    if (!s || s.store_id !== storeId || s.revoked_at || s.expires_at <= new Date()) return null;
    if (Date.now() - s.last_seen_at.getTime() > 5 * 60_000)
      await this.prisma.customerSession.update({
        where: { id: s.id },
        data: { last_seen_at: new Date() },
      });
    return s.customer_id;
  }

  async require(storeId: string, token: string | undefined): Promise<string> {
    const id = await this.resolve(storeId, token);
    if (!id) throw signedOut();
    return id;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.prisma.customerSession.updateMany({
      where: { token_hash: sha256(token), revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  // ───────────── Sign-up and sign-in ─────────────

  async register(
    storeId: string,
    input: CustomerRegister,
    meta: Meta,
  ): Promise<{ token: string | null; link_sent: boolean }> {
    await this.rateLimit.hit(`customer-register:${storeId}:${meta.ip ?? "unknown"}`, 10, 3600);
    const existing = await this.prisma.customer.findUnique({
      where: { store_id_email: { store_id: storeId, email: input.email } },
    });
    if (existing?.password_hash)
      throw new AppException(
        CUSTOMER_ERROR_CODES.ACCOUNT_EXISTS,
        "You already have an account. Sign in, or reset your password.",
        HttpStatus.CONFLICT,
        [{ path: "email", message: "Already has an account", code: "taken" }],
      );
    if (existing) {
      // Past guest orders: prove the mailbox before showing them.
      await this.sendLink(storeId, existing.id, existing.email, "set");
      return { token: null, link_sent: true };
    }
    const hash = await this.passwords.hash(input.password);
    const c = await this.prisma.customer.create({
      data: {
        store_id: storeId,
        email: input.email,
        password_hash: hash,
        first_name: input.first_name ?? null,
        last_name: input.last_name ?? null,
        accepts_marketing: input.accepts_marketing,
      },
    });
    return { token: await this.startSession(storeId, c.id), link_sent: false };
  }

  async login(storeId: string, email: string, password: string, meta: Meta): Promise<string> {
    const key = `customer-login:${storeId}:${meta.ip ?? "unknown"}:${sha256(email).slice(0, 16)}`;
    await this.rateLimit.hit(key, 10, 15 * 60);
    const c = await this.prisma.customer.findUnique({
      where: { store_id_email: { store_id: storeId, email } },
    });
    const ok = c?.password_hash
      ? await this.passwords.verify(c.password_hash, password)
      : (await this.passwords.verifyDummy(password), false);
    if (!c || !ok) throw invalidLogin();
    await this.rateLimit.reset(key);
    return this.startSession(storeId, c.id);
  }

  /** Always answers the same; emails a link only to existing customers. */
  async forgot(storeId: string, email: string, meta: Meta): Promise<void> {
    await this.rateLimit.hit(`customer-forgot:${storeId}:${meta.ip ?? "unknown"}`, 20, 3600);
    const c = await this.prisma.customer.findUnique({
      where: { store_id_email: { store_id: storeId, email } },
    });
    if (!c) return;
    const recent = await this.prisma.customerToken.count({
      where: { customer_id: c.id, created_at: { gt: new Date(Date.now() - LINK_MS) } },
    });
    if (recent >= 3) return;
    await this.sendLink(storeId, c.id, c.email, c.password_hash ? "reset" : "set");
  }

  /** From an emailed link: sets the password, ends other sessions, signs in. */
  async reset(storeId: string, token: string, password: string): Promise<string> {
    const hash = await this.passwords.hash(password);
    const customerId = await this.prisma.$transaction(async (tx) => {
      const t = await tx.customerToken.findUnique({
        where: { token_hash: sha256(token) },
        include: { customer: { select: { store_id: true } } },
      });
      if (!t || t.used_at || t.expires_at <= new Date() || t.customer.store_id !== storeId)
        throw new AppException(
          CUSTOMER_ERROR_CODES.LINK_INVALID,
          "This link is invalid or has expired. Ask for a new one.",
          HttpStatus.BAD_REQUEST,
        );
      await tx.customerToken.updateMany({
        where: { customer_id: t.customer_id, used_at: null },
        data: { used_at: new Date() },
      });
      await tx.customer.update({ where: { id: t.customer_id }, data: { password_hash: hash } });
      await tx.customerSession.updateMany({
        where: { customer_id: t.customer_id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      return t.customer_id;
    });
    return this.startSession(storeId, customerId);
  }

  private async sendLink(
    storeId: string,
    customerId: string,
    email: string,
    kind: "set" | "reset",
  ) {
    const token = generateToken(32);
    await this.prisma.customerToken.create({
      data: {
        customer_id: customerId,
        purpose: kind,
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + LINK_MS),
      },
    });
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { name: true, contact_email: true },
    });
    const url = await this.domains.storefrontLink(
      storeId,
      `/account/reset?token=${encodeURIComponent(token)}`,
    );
    const what = kind === "set" ? "create your account" : "choose a new password";
    await this.mailer.send({
      to: email,
      replyTo: store.contact_email ?? undefined,
      subject:
        kind === "set" ? `Create your ${store.name} account` : `Reset your ${store.name} password`,
      text: `Use this link to ${what} at ${store.name}. It works once and expires in 1 hour:\n\n${url}\n\nDidn't ask for this? Ignore this email.`,
      html: `<p>Use this link to ${what} at ${escapeHtml(store.name)}. It works once and expires in 1 hour:</p><p><a href="${escapeHtml(url ?? "")}">${kind === "set" ? "Create my account" : "Choose a new password"}</a></p><p>Didn't ask for this? Ignore this email.</p>`,
    });
  }

  // ───────────── Profile and addresses ─────────────

  async profile(storeId: string, customerId: string): Promise<StorefrontCustomer> {
    const c = await this.prisma.customer.findFirstOrThrow({
      where: { id: customerId, store_id: storeId },
      include: { addresses: { orderBy: [{ is_default: "desc" }, { created_at: "asc" }] } },
    });
    return {
      id: c.id,
      email: c.email,
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      accepts_marketing: c.accepts_marketing,
      addresses: c.addresses.map((a) => ({
        id: a.id,
        address: a.address as unknown as CommerceAddress,
        is_default: a.is_default,
      })),
    };
  }

  async updateProfile(storeId: string, customerId: string, input: CustomerProfile) {
    await this.prisma.customer.update({ where: { id: customerId }, data: input });
    return this.profile(storeId, customerId);
  }

  async saveAddress(
    storeId: string,
    customerId: string,
    input: CustomerAddressInput,
    addressId?: string,
  ): Promise<StorefrontCustomer> {
    await this.prisma.$transaction(async (tx) => {
      const count = await tx.customerAddress.count({ where: { customer_id: customerId } });
      if (!addressId && count >= 10)
        throw new AppException(
          "VALIDATION_FAILED",
          "You can save up to 10 addresses.",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      // The first address is the default; making one default unsets the others.
      const isDefault = input.is_default || count === 0;
      if (isDefault)
        await tx.customerAddress.updateMany({
          where: { customer_id: customerId },
          data: { is_default: false },
        });
      const data = { address: input.address as object, ...(isDefault ? { is_default: true } : {}) };
      if (addressId) {
        const r = await tx.customerAddress.updateMany({
          where: { id: addressId, customer_id: customerId },
          data,
        });
        if (!r.count) throw AppException.notFound("Address");
      } else
        await tx.customerAddress.create({
          data: { ...data, store_id: storeId, customer_id: customerId },
        });
    });
    return this.profile(storeId, customerId);
  }

  async deleteAddress(storeId: string, customerId: string, addressId: string) {
    await this.prisma.$transaction(async (tx) => {
      const a = await tx.customerAddress.findFirst({
        where: { id: addressId, customer_id: customerId },
      });
      if (!a) throw AppException.notFound("Address");
      await tx.customerAddress.delete({ where: { id: a.id } });
      if (a.is_default) {
        const next = await tx.customerAddress.findFirst({
          where: { customer_id: customerId },
          orderBy: { created_at: "asc" },
        });
        if (next)
          await tx.customerAddress.update({ where: { id: next.id }, data: { is_default: true } });
      }
    });
    return this.profile(storeId, customerId);
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
