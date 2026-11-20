import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Prisma, Store } from "@cartforge/database";
import { PLATFORM_ERROR_CODES, SYSTEM_ROLES } from "@cartforge/types";
import { handleFromName } from "@cartforge/validation";
import { randomBytes } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { API_ENV, type ApiEnv } from "../config/env";

type Tx = Prisma.TransactionClient;

export const verificationToken = () => randomBytes(16).toString("hex");

/**
 * Creates a complete, isolated store (P1): system roles, default inventory
 * location, the owner's membership and — on SaaS — its platform subdomain.
 * Used by sign-up, "create another store" and the platform admin.
 */
@Injectable()
export class StoreProvisioningService {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly audit: AuditService,
  ) {}

  async handleAvailable(
    client: Pick<Tx, "store" | "storeDomain">,
    handle: string,
  ): Promise<boolean> {
    const taken = await client.store.findUnique({ where: { handle }, select: { id: true } });
    if (taken) return false;
    if (this.env.PLATFORM_DOMAIN) {
      const host = await client.storeDomain.findUnique({
        where: { hostname: `${handle}.${this.env.PLATFORM_DOMAIN}` },
        select: { id: true },
      });
      if (host) return false;
    }
    return true;
  }

  /** The requested handle (must be free) or the first free variant of one derived from the name. */
  async pickHandle(tx: Tx, name: string, requested?: string): Promise<string> {
    if (requested) {
      if (!(await this.handleAvailable(tx, requested))) {
        throw AppException.conflict(
          "This store address is already taken.",
          [{ path: "handle", message: "This address is already taken.", code: "taken" }],
          PLATFORM_ERROR_CODES.HANDLE_TAKEN,
        );
      }
      return requested;
    }
    const base = handleFromName(name);
    for (let i = 1; i < 50; i++) {
      const candidate = i === 1 ? base : `${base.slice(0, 55)}-${i}`;
      if (await this.handleAvailable(tx, candidate)) return candidate;
    }
    return `${base.slice(0, 50)}-${randomBytes(3).toString("hex")}`;
  }

  async create(
    tx: Tx,
    args: {
      name: string;
      handle?: string;
      currency: string;
      owner_user_id: string;
      contact_email?: string | null;
      request_id?: string;
    },
  ): Promise<Store> {
    const handle = await this.pickHandle(tx, args.name, args.handle);
    const store = await tx.store.create({
      data: {
        name: args.name,
        handle,
        currency: args.currency,
        contact_email: args.contact_email ?? null,
      },
    });
    let ownerRoleId = "";
    for (const [key, role] of Object.entries(SYSTEM_ROLES)) {
      const r = await tx.role.create({
        data: {
          store_id: store.id,
          key,
          name: role.name,
          permissions: [...role.permissions],
          is_system: true,
        },
      });
      if (key === "owner") ownerRoleId = r.id;
    }
    await tx.inventoryLocation.create({
      data: { store_id: store.id, name: "Main location", is_default: true },
    });
    await tx.storeMembership.create({
      data: { store_id: store.id, user_id: args.owner_user_id, role_id: ownerRoleId },
    });
    if (this.env.PLATFORM_DOMAIN) {
      await tx.storeDomain.create({
        data: {
          store_id: store.id,
          hostname: `${handle}.${this.env.PLATFORM_DOMAIN}`,
          kind: "platform",
          status: "active",
          is_primary: true,
          verification_token: verificationToken(),
          verified_at: new Date(),
        },
      });
    }
    await this.audit.recordIn(tx, {
      action: "store.created",
      resource_type: "store",
      resource_id: store.id,
      store_id: store.id,
      actor_user_id: args.owner_user_id,
      metadata: { handle, currency: args.currency },
      request_id: args.request_id,
    });
    return store;
  }

  /** May this user create another store? SaaS: anyone signed in (when sign-up is on); self-hosted: platform admins. */
  canCreate(user: { is_platform_admin: boolean }): boolean {
    if (user.is_platform_admin) return true;
    return this.env.CARTFORGE_EDITION === "saas" && this.env.SIGNUP_ENABLED;
  }

  storeCreationDisabled() {
    return new AppException(
      PLATFORM_ERROR_CODES.STORE_CREATION_DISABLED,
      "Creating stores isn't enabled on this installation.",
      HttpStatus.FORBIDDEN,
    );
  }
}
