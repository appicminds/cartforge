import { Injectable } from "@nestjs/common";
import { Prisma, type ShippingMethod } from "@cartforge/database";
import {
  checkoutSettingsSchema,
  shippingMethodSchema,
  DEFAULT_CHECKOUT_SETTINGS,
  type CheckoutSettings,
  type ShippingMethodConfig,
  type ShippingMethodData,
} from "@cartforge/checkout-engine";
import { COMMERCE_ERROR_CODES, type ShippingMethodView } from "@cartforge/types";
import { HttpStatus } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { zodIssuesToFields } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";

export interface SettingsActor {
  store_id: string;
  user_id: string;
  request_id: string;
}

type Client = Pick<Prisma.TransactionClient, "checkoutSettings" | "shippingMethod">;

const notFound = () =>
  new AppException(
    COMMERCE_ERROR_CODES.SHIPPING_METHOD_NOT_FOUND,
    "Shipping method not found.",
    HttpStatus.NOT_FOUND,
  );

export function toShippingView(m: ShippingMethod): ShippingMethodView {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    price_minor: Number(m.price_minor),
    free_over_minor: m.free_over_minor === null ? null : Number(m.free_over_minor),
    countries: m.countries,
    regions: m.regions,
    cities: m.cities,
    min_order_minor: m.min_order_minor === null ? null : Number(m.min_order_minor),
    max_order_minor: m.max_order_minor === null ? null : Number(m.max_order_minor),
    per_item_minor: Number(m.per_item_minor),
    min_days: m.min_days,
    max_days: m.max_days,
    active: m.active,
    position: m.position,
  };
}

const big = (v: number | null) => (v === null ? null : BigInt(v));

/** Column values for a validated method. */
function shippingData(input: ShippingMethodData) {
  return {
    name: input.name,
    description: input.description ?? null,
    price_minor: BigInt(input.price_minor),
    free_over_minor: big(input.free_over_minor),
    countries: input.countries,
    regions: input.regions,
    cities: input.cities,
    min_order_minor: big(input.min_order_minor),
    max_order_minor: big(input.max_order_minor),
    per_item_minor: BigInt(input.per_item_minor),
    min_days: input.min_days,
    max_days: input.max_days,
    active: input.active,
  };
}

export const toShippingConfig = (m: ShippingMethod): ShippingMethodConfig => ({
  ...toShippingView(m),
});

/** Checkout configuration and flat-rate shipping methods per store. */
@Injectable()
export class CommerceSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(storeId: string, client: Client = this.prisma): Promise<CheckoutSettings> {
    const row = await client.checkoutSettings.findUnique({ where: { store_id: storeId } });
    if (!row) return DEFAULT_CHECKOUT_SETTINGS;
    const { store_id: _s, updated_by: _u, updated_at: _t, ...values } = row;
    // Rows are written through the schema; re-parsing guards against manual edits.
    const parsed = checkoutSettingsSchema.safeParse(values);
    return parsed.success ? parsed.data : DEFAULT_CHECKOUT_SETTINGS;
  }

  async update(input: CheckoutSettings, actor: SettingsActor): Promise<CheckoutSettings> {
    const data = {
      ...input,
      custom_fields: input.custom_fields as unknown as Prisma.InputJsonValue,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.checkoutSettings.upsert({
        where: { store_id: actor.store_id },
        create: { store_id: actor.store_id, ...data, updated_by: actor.user_id },
        update: { ...data, updated_by: actor.user_id },
      });
      await this.audit.recordIn(tx, {
        action: "checkout_settings.updated",
        resource_type: "store",
        resource_id: actor.store_id,
        store_id: actor.store_id,
        actor_user_id: actor.user_id,
        metadata: {
          tax_rate_bps: input.tax_rate_bps,
          cod_enabled: input.cod_enabled,
          bank_transfer_enabled: input.bank_transfer_enabled,
          wallet_enabled: input.wallet_enabled,
        },
        request_id: actor.request_id,
      });
    });
    return this.get(actor.store_id);
  }

  async shippingMethods(storeId: string, client: Client = this.prisma): Promise<ShippingMethod[]> {
    return client.shippingMethod.findMany({
      where: { store_id: storeId },
      orderBy: [{ position: "asc" }, { created_at: "asc" }],
    });
  }

  async createShipping(
    input: ShippingMethodData,
    actor: SettingsActor,
  ): Promise<ShippingMethodView> {
    const max = await this.prisma.shippingMethod.aggregate({
      where: { store_id: actor.store_id },
      _max: { position: true },
    });
    const m = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shippingMethod.create({
        data: {
          ...shippingData(input),
          store_id: actor.store_id,
          position: (max._max.position ?? -1) + 1,
        },
      });
      await this.record(tx, actor, "shipping_method.created", created.id, { name: created.name });
      return created;
    });
    return toShippingView(m);
  }

  async updateShipping(
    id: string,
    /** The fields the client sent (already type-checked); merged over the saved method. */
    input: Record<string, unknown>,
    actor: SettingsActor,
  ): Promise<ShippingMethodView> {
    const m = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.shippingMethod.findFirst({
        where: { id, store_id: actor.store_id },
      });
      if (!existing) throw notFound();
      // Rules span fields (e.g. regions need one country), so check the merged result.
      const { id: _i, position: _p, ...current } = toShippingView(existing);
      const merged = shippingMethodSchema.safeParse({
        ...current,
        description: current.description ?? undefined,
        ...input,
      });
      if (!merged.success) throw AppException.validation(zodIssuesToFields(merged.error.issues));
      const updated = await tx.shippingMethod.update({
        where: { id },
        data: shippingData(merged.data),
      });
      await this.record(tx, actor, "shipping_method.updated", id, { name: updated.name });
      return updated;
    });
    return toShippingView(m);
  }

  async deleteShipping(id: string, actor: SettingsActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.shippingMethod.findFirst({
        where: { id, store_id: actor.store_id },
      });
      if (!existing) throw notFound();
      // Open checkouts that chose it simply have to choose again.
      await tx.checkout.updateMany({
        where: { store_id: actor.store_id, shipping_method_id: id, status: "open" },
        data: { shipping_method_id: null },
      });
      await tx.shippingMethod.delete({ where: { id } });
      await this.record(tx, actor, "shipping_method.deleted", id, { name: existing.name });
    });
  }

  private record(
    tx: Prisma.TransactionClient,
    actor: SettingsActor,
    action: string,
    id: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return this.audit.recordIn(tx, {
      action,
      resource_type: "shipping_method",
      resource_id: id,
      store_id: actor.store_id,
      actor_user_id: actor.user_id,
      metadata,
      request_id: actor.request_id,
    });
  }
}
