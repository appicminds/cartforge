import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { StoreDomain } from "@cartforge/database";
import { PLATFORM_ERROR_CODES, type ResolvedStore, type StoreDomainView } from "@cartforge/types";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { API_ENV, type ApiEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import {
  DNS_RESOLVER,
  DOMAIN_PROVIDER,
  type DnsResolver,
  type DomainProvider,
} from "./domain-provider";
import { verificationToken } from "./provisioning.service";

export interface DomainActor {
  store_id: string;
  user_id: string;
  request_id: string;
}

export const TXT_PREFIX = "_cartforge-verify";

const notFound = () =>
  new AppException(
    PLATFORM_ERROR_CODES.DOMAIN_NOT_FOUND,
    "Domain not found.",
    HttpStatus.NOT_FOUND,
  );

/**
 * Store domains (P1): the automatic platform subdomain plus merchant-owned
 * domains proven by a DNS TXT record. A hostname serves at most one store;
 * an unverified claim never blocks the real owner.
 */
@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(DOMAIN_PROVIDER) private readonly provider: DomainProvider,
    @Inject(DNS_RESOLVER) private readonly dns: DnsResolver,
  ) {}

  private cnameTarget(): string | null {
    return (
      this.env.PLATFORM_CNAME_TARGET ??
      (this.env.PLATFORM_DOMAIN ? `stores.${this.env.PLATFORM_DOMAIN}` : null)
    );
  }

  toView(d: StoreDomain): StoreDomainView {
    const dns: StoreDomainView["dns"] = [];
    if (d.kind === "custom") {
      dns.push({
        type: "TXT",
        name: `${TXT_PREFIX}.${d.hostname}`,
        value: `cartforge-verify=${d.verification_token}`,
        purpose: "Proves you own the domain",
      });
      const target = this.cnameTarget();
      if (target)
        dns.push({
          type: "CNAME",
          name: d.hostname,
          value: target,
          purpose: "Sends visitors to your store (use ALIAS/ANAME for a root domain)",
        });
    }
    return {
      id: d.id,
      hostname: d.hostname,
      kind: d.kind,
      status: d.status,
      is_primary: d.is_primary,
      verified_at: d.verified_at?.toISOString() ?? null,
      last_error: d.last_error,
      dns,
    };
  }

  async list(storeId: string): Promise<StoreDomainView[]> {
    const rows = await this.prisma.storeDomain.findMany({
      where: { store_id: storeId },
      orderBy: [{ is_primary: "desc" }, { kind: "asc" }, { created_at: "asc" }],
    });
    return rows.map((d) => this.toView(d));
  }

  async add(hostname: string, actor: DomainActor): Promise<StoreDomainView> {
    const pd = this.env.PLATFORM_DOMAIN;
    if (pd && (hostname === pd || hostname.endsWith(`.${pd}`))) {
      throw new AppException(
        PLATFORM_ERROR_CODES.DOMAIN_RESERVED,
        `Addresses on ${pd} are managed by the platform.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        [{ path: "hostname", message: `Use your own domain, not one on ${pd}.`, code: "reserved" }],
      );
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.storeDomain.findUnique({ where: { hostname } });
      if (existing) {
        if (existing.store_id === actor.store_id) return existing;
        if (existing.status === "active") {
          throw AppException.conflict(
            "This domain is connected to another store.",
            [
              {
                path: "hostname",
                message: "This domain is already connected to another store.",
                code: "taken",
              },
            ],
            PLATFORM_ERROR_CODES.DOMAIN_TAKEN,
          );
        }
        // An unproven claim by someone else must not block the real owner.
        await tx.storeDomain.delete({ where: { id: existing.id } });
      }
      const d = await tx.storeDomain.create({
        data: {
          store_id: actor.store_id,
          hostname,
          kind: "custom",
          status: "pending",
          verification_token: verificationToken(),
        },
      });
      await this.record(tx, actor, "domain.added", d.id, { hostname });
      return d;
    });
    return this.toView(created);
  }

  async verify(id: string, actor: DomainActor): Promise<StoreDomainView> {
    const d = await this.prisma.storeDomain.findFirst({ where: { id, store_id: actor.store_id } });
    if (!d) throw notFound();
    if (d.status === "active") return this.toView(d);
    const expected = `cartforge-verify=${d.verification_token}`;
    let records: string[] = [];
    try {
      records = (await this.dns.resolveTxt(`${TXT_PREFIX}.${d.hostname}`)).map((parts) =>
        parts.join(""),
      );
    } catch {
      records = [];
    }
    if (!records.includes(expected)) {
      const msg =
        "We couldn't find the TXT record yet. DNS changes can take a few minutes, sometimes up to 48 hours.";
      await this.prisma.storeDomain.update({ where: { id }, data: { last_error: msg } });
      throw new AppException(
        PLATFORM_ERROR_CODES.DOMAIN_NOT_VERIFIED,
        msg,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    // Someone else may have verified the same hostname first.
    const clash = await this.prisma.storeDomain.findFirst({
      where: { hostname: d.hostname, status: "active", NOT: { id } },
    });
    if (clash)
      throw AppException.conflict(
        "This domain is connected to another store.",
        [],
        PLATFORM_ERROR_CODES.DOMAIN_TAKEN,
      );
    try {
      await this.provider.attach(d.hostname);
    } catch (err) {
      const msg = (err as Error).message.slice(0, 300);
      await this.prisma.storeDomain.update({ where: { id }, data: { last_error: msg } });
      throw new AppException(PLATFORM_ERROR_CODES.DOMAIN_NOT_VERIFIED, msg, HttpStatus.BAD_GATEWAY);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const hasPrimary = await tx.storeDomain.count({
        where: { store_id: actor.store_id, is_primary: true, status: "active" },
      });
      const u = await tx.storeDomain.update({
        where: { id },
        data: {
          status: "active",
          verified_at: new Date(),
          last_error: null,
          is_primary: hasPrimary === 0,
        },
      });
      await this.record(tx, actor, "domain.verified", id, { hostname: d.hostname });
      return u;
    });
    return this.toView(updated);
  }

  async makePrimary(id: string, actor: DomainActor): Promise<StoreDomainView[]> {
    await this.prisma.$transaction(async (tx) => {
      const d = await tx.storeDomain.findFirst({ where: { id, store_id: actor.store_id } });
      if (!d) throw notFound();
      if (d.status !== "active")
        throw new AppException(
          PLATFORM_ERROR_CODES.DOMAIN_NOT_VERIFIED,
          "Verify this domain before making it primary.",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      await tx.storeDomain.updateMany({
        where: { store_id: actor.store_id },
        data: { is_primary: false },
      });
      await tx.storeDomain.update({ where: { id }, data: { is_primary: true } });
      await this.record(tx, actor, "domain.primary_changed", id, { hostname: d.hostname });
    });
    return this.list(actor.store_id);
  }

  async remove(id: string, actor: DomainActor): Promise<void> {
    const d = await this.prisma.storeDomain.findFirst({ where: { id, store_id: actor.store_id } });
    if (!d) throw notFound();
    if (d.kind === "platform")
      throw new AppException(
        PLATFORM_ERROR_CODES.DOMAIN_RESERVED,
        "Your platform address can't be removed.",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.storeDomain.delete({ where: { id } });
      if (d.is_primary) {
        const fallback = await tx.storeDomain.findFirst({
          where: { store_id: actor.store_id, status: "active" },
          orderBy: [{ kind: "desc" }, { created_at: "asc" }],
        });
        if (fallback)
          await tx.storeDomain.update({ where: { id: fallback.id }, data: { is_primary: true } });
      }
      await this.record(tx, actor, "domain.removed", id, { hostname: d.hostname });
    });
    if (d.status === "active") await this.provider.detach(d.hostname);
  }

  /** Host → active store, for the shared storefront. "www." falls back to the bare domain. */
  async resolve(host: string): Promise<ResolvedStore | null> {
    const h = host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
    if (!h || h.length > 253) return null;
    const candidates = h.startsWith("www.") ? [h, h.slice(4)] : [h];
    const d = await this.prisma.storeDomain.findFirst({
      where: { hostname: { in: candidates }, status: "active", store: { status: "active" } },
      include: {
        store: { include: { domains: { where: { is_primary: true, status: "active" } } } },
      },
    });
    if (!d) return null;
    const primary = d.store.domains[0]?.hostname ?? d.hostname;
    return { store_id: d.store_id, name: d.store.name, url: `https://${primary}` };
  }

  /** For reverse proxies with on-demand TLS (Caddy "ask"): only issue certificates for real store domains. */
  async tlsAllowed(host: string): Promise<boolean> {
    return (await this.resolve(host)) !== null;
  }

  primaryUrl(domains: { hostname: string; is_primary: boolean; status: string }[]): string | null {
    const p = domains.find((d) => d.is_primary && d.status === "active");
    return p ? `https://${p.hostname}` : null;
  }

  private record(
    tx: Parameters<AuditService["recordIn"]>[0],
    actor: DomainActor,
    action: string,
    id: string,
    metadata: Record<string, string>,
  ) {
    return this.audit.recordIn(tx, {
      action,
      resource_type: "store_domain",
      resource_id: id,
      store_id: actor.store_id,
      actor_user_id: actor.user_id,
      metadata,
      request_id: actor.request_id,
    });
  }
}
