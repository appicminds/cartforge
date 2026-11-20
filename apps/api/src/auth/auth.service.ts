import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@cartforge/database";
import {
  ERROR_CODES,
  isPermission,
  PLATFORM_ERROR_CODES,
  type CurrentUser,
} from "@cartforge/types";
import type { LoginInput, Signup } from "@cartforge/validation";
import { API_ENV, type ApiEnv } from "../config/env";
import { StoreProvisioningService } from "../platform/provisioning.service";
import { DomainsService } from "../platform/domains.service";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordService } from "./password.service";
import { RateLimitService } from "./rate-limit.service";
import { SessionService } from "./session.service";
import { sha256 } from "./tokens";

interface RequestMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    private readonly provisioning: StoreProvisioningService,
    private readonly domains: DomainsService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /**
   * Public "create your store" (P1, SaaS): account + store + owner role in one
   * transaction, then signed in. Off unless SIGNUP_ENABLED.
   */
  async signup(input: Signup, meta: RequestMeta) {
    if (!this.env.SIGNUP_ENABLED) {
      throw new AppException(
        PLATFORM_ERROR_CODES.SIGNUP_DISABLED,
        "Sign-up isn't available on this installation.",
        HttpStatus.NOT_FOUND,
      );
    }
    await this.rateLimit.hit(`signup:${meta.ip ?? "unknown"}`, 10, 60 * 60);
    const hash = await this.passwords.hash(input.password);
    let userId: string;
    try {
      userId = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: input.email, name: input.name, password_hash: hash },
        });
        await this.provisioning.create(tx, {
          name: input.store_name,
          handle: input.handle,
          currency: input.currency,
          owner_user_id: user.id,
          contact_email: input.email,
          request_id: meta.requestId,
        });
        await this.audit.recordIn(tx, {
          action: "auth.signup",
          resource_type: "user",
          resource_id: user.id,
          actor_user_id: user.id,
          ip: meta.ip,
          request_id: meta.requestId,
        });
        return user.id;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const target = String(err.meta?.target ?? "");
        if (target.includes("email"))
          throw AppException.conflict(
            "An account with this email already exists. Sign in to add another store.",
            [
              {
                path: "email",
                message: "An account with this email already exists.",
                code: "taken",
              },
            ],
            PLATFORM_ERROR_CODES.EMAIL_TAKEN,
          );
        throw AppException.conflict(
          "This store address is already taken.",
          [{ path: "handle", message: "This address is already taken.", code: "taken" }],
          PLATFORM_ERROR_CODES.HANDLE_TAKEN,
        );
      }
      throw err;
    }
    const { token, session } = await this.sessions.create(userId, meta);
    await this.prisma.user.update({ where: { id: userId }, data: { last_login_at: new Date() } });
    return { token, expiresAt: session.expires_at, user: await this.currentUser(userId) };
  }

  async login(input: LoginInput, meta: RequestMeta) {
    const limiterKey = `login:${meta.ip ?? "unknown"}:${sha256(input.email).slice(0, 16)}`;
    await this.rateLimit.hit(limiterKey, 10, 15 * 60);

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const ok = user
      ? user.status === "active" &&
        (await this.passwords.verify(user.password_hash, input.password))
      : (await this.passwords.verifyDummy(input.password), false);

    if (!user || !ok) {
      await this.audit.record({
        action: "auth.login_failed",
        resource_type: "user",
        resource_id: user?.id,
        actor_user_id: null,
        ip: meta.ip,
        request_id: meta.requestId,
      });
      throw new AppException(
        ERROR_CODES.INVALID_CREDENTIALS,
        "Email or password is incorrect.",
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.rateLimit.reset(limiterKey);
    const { token, session } = await this.sessions.create(user.id, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });
    await this.audit.record({
      action: "auth.login",
      resource_type: "session",
      resource_id: session.id,
      actor_user_id: user.id,
      ip: meta.ip,
      request_id: meta.requestId,
    });
    return { token, expiresAt: session.expires_at, user: await this.currentUser(user.id) };
  }

  async logout(sessionId: string, userId: string, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(sessionId);
    await this.audit.record({
      action: "auth.logout",
      resource_type: "session",
      resource_id: sessionId,
      actor_user_id: userId,
      ip: meta.ip,
      request_id: meta.requestId,
    });
  }

  async currentUser(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: "active" },
          include: {
            store: { include: { domains: { where: { is_primary: true, status: "active" } } } },
            role: true,
          },
          orderBy: { store: { name: "asc" } },
        },
      },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      is_platform_admin: user.is_platform_admin,
      can_create_stores: this.provisioning.canCreate(user),
      stores: user.memberships.map((m) => ({
        store_id: m.store_id,
        store_name: m.store.name,
        store_handle: m.store.handle,
        store_status: m.store.status,
        store_url: this.domains.primaryUrl(m.store.domains),
        store_preview_url: this.domains.previewUrl(m.store.handle),
        role_key: m.role.key,
        role_name: m.role.name,
        permissions: m.role.permissions.filter(isPermission),
      })),
    };
  }
}
