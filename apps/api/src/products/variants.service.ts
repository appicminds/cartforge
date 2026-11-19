import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, storeScoped, type ProductVariant } from "@cartforge/database";
import { CATALOG_ERROR_CODES, type FieldError, type VariantPlan } from "@cartforge/types";
import type {
  ProductOptionsApply,
  ProductOptionsInput,
  VariantBulkUpdate,
  VariantUpdate,
} from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { InventoryService } from "../inventory/inventory.service";
import { PrismaService } from "../prisma/prisma.service";
import { comboTitle, planVariants, type ExistingVariant, type Plan } from "./variant-plan";

type Tx = Prisma.TransactionClient;
const LIVE = { deleted_at: null } as const;

export interface VariantActor {
  store_id: string;
  user_id: string;
  request_id?: string;
}

/** Fields shared by variant edits and simple-product edits (applied to the default variant). */
export interface VariantFieldInput {
  sku?: string | null;
  barcode?: string | null;
  price_minor?: number | null;
  compare_at_minor?: number | null;
  cost_minor?: number | null;
  inventory_tracking?: boolean;
  continue_selling?: boolean;
  low_stock_threshold?: number | null;
  media_asset_id?: string | null;
}

const big = (v: number | null | undefined) => (v === null || v === undefined ? null : BigInt(v));
const num = (v: bigint | null) => (v === null ? null : Number(v));

export function skuTaken(sku: string, path = "sku") {
  return AppException.conflict(
    "Another variant in this store already uses this SKU.",
    [{ path, message: `The SKU "${sku}" is already in use.`, code: "taken" }],
    CATALOG_ERROR_CODES.SKU_TAKEN,
  );
}

export function isSkuViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const t = err.meta?.target;
  return (Array.isArray(t) ? t.join(",") : String(t ?? "")).includes("sku");
}

@Injectable()
export class VariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  // ───────────── Options & generation ─────────────

  async preview(
    storeId: string,
    productId: string,
    options: ProductOptionsInput,
  ): Promise<VariantPlan> {
    const existing = await this.loadExisting(this.prisma, storeId, productId);
    return this.describe(planVariants(options, existing.variants), existing.onHand, existing.skus);
  }

  /**
   * Applies options and reconciles variants. Removing variants requires
   * `confirm_removals` (PRD §8.4 F: no accidental regeneration).
   */
  async apply(
    productId: string,
    input: ProductOptionsApply,
    actor: VariantActor,
  ): Promise<VariantPlan> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM products WHERE id = ${productId}::uuid AND store_id = ${actor.store_id}::uuid AND deleted_at IS NULL FOR UPDATE`;
        if (!locked.length) throw AppException.notFound("Product");

        const existing = await this.loadExisting(tx, actor.store_id, productId);
        const plan = planVariants(input.options, existing.variants);
        const described = this.describe(plan, existing.onHand, existing.skus);

        if (plan.remove.length && !input.confirm_removals) {
          throw new AppException(
            CATALOG_ERROR_CODES.VARIANT_REMOVAL_REQUIRES_CONFIRMATION,
            `This change removes ${plan.remove.length} variant${plan.remove.length === 1 ? "" : "s"}. Confirm to continue.`,
            HttpStatus.CONFLICT,
            described.remove.map((r) => ({
              path: `variant:${r.variant_id}`,
              message: r.title,
              code: "will_remove",
            })),
          );
        }

        // Recreate options/values (variant links are rebuilt below).
        await tx.productOption.deleteMany({ where: { product_id: productId } });
        const valueIds: Map<string, string>[] = [];
        for (const [i, opt] of input.options.entries()) {
          const created = await tx.productOption.create({
            data: {
              store_id: actor.store_id,
              product_id: productId,
              name: opt.name,
              position: i,
              values: {
                create: opt.values.map((value, j) => ({
                  store_id: actor.store_id,
                  value,
                  position: j,
                })),
              },
            },
            include: { values: true },
          });
          valueIds.push(new Map(created.values.map((v) => [v.value.toLowerCase(), v.id])));
        }
        const idsFor = (combo: string[]) =>
          combo.map((value, i) => valueIds[i]!.get(value.toLowerCase())!);
        const signature = (ids: string[]) => [...ids].sort().join(",");
        const positionOf = new Map(plan.ordered.map((c, i) => [comboTitle(c), i]));

        // Removed variants first, so their signatures/SKUs free up.
        if (plan.remove.length) {
          await tx.productVariant.updateMany({
            where: { id: { in: plan.remove.map((r) => r.id) } },
            data: { deleted_at: new Date() },
          });
        }

        const template =
          existing.rows.find((r) => r.id === plan.keep[0]?.variant_id) ?? existing.rows[0];
        for (const k of plan.keep) {
          const ids = idsFor(k.combination);
          await tx.productVariantOptionValue.deleteMany({ where: { variant_id: k.variant_id } });
          if (ids.length) {
            await tx.productVariantOptionValue.createMany({
              data: ids.map((option_value_id) => ({ variant_id: k.variant_id, option_value_id })),
            });
          }
          await tx.productVariant.update({
            where: { id: k.variant_id },
            data: {
              title: comboTitle(k.combination),
              option_signature: signature(ids),
              position: positionOf.get(comboTitle(k.combination)) ?? 0,
            },
          });
        }

        const location = await this.inventory.defaultLocation(tx, actor.store_id);
        const currency = (
          await tx.store.findUniqueOrThrow({
            where: { id: actor.store_id },
            select: { currency: true },
          })
        ).currency;
        for (const combo of plan.create) {
          const ids = idsFor(combo);
          // New variants start from the first kept variant's pricing/settings, not from zero.
          await tx.productVariant.create({
            data: {
              store_id: actor.store_id,
              product_id: productId,
              title: comboTitle(combo),
              position: positionOf.get(comboTitle(combo)) ?? 0,
              option_signature: signature(ids),
              currency,
              price_minor: template?.price_minor ?? null,
              compare_at_minor: template?.compare_at_minor ?? null,
              cost_minor: template?.cost_minor ?? null,
              inventory_tracking: template?.inventory_tracking ?? true,
              continue_selling: template?.continue_selling ?? false,
              option_values: { create: ids.map((option_value_id) => ({ option_value_id })) },
              inventory: { create: { store_id: actor.store_id, location_id: location.id } },
            },
          });
        }

        await tx.product.update({
          where: { id: productId },
          data: {
            product_type: input.options.length ? "variable" : "simple",
            updated_by: actor.user_id,
          },
        });
        await this.audit.recordIn(tx, {
          action: "product.variants.updated",
          resource_type: "product",
          resource_id: productId,
          store_id: actor.store_id,
          actor_user_id: actor.user_id,
          metadata: {
            options: input.options.map((o) => ({ name: o.name, values: o.values })),
            kept: described.keep.length,
            created: described.create.map((c) => c.title),
            removed: described.remove.map((r) => ({
              id: r.variant_id,
              title: r.title,
              on_hand: r.on_hand,
            })),
          },
          request_id: actor.request_id,
        });
        return described;
      });
    } catch (err) {
      if (isSkuViolation(err)) throw skuTaken("(generated)");
      throw err;
    }
  }

  // ───────────── Variant edits ─────────────

  async update(variantId: string, input: VariantUpdate, actor: VariantActor): Promise<string> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const variant = await this.lockVariant(tx, actor.store_id, variantId);
        const changed = await this.applyFields(tx, actor.store_id, variant, input);
        if (changed.length) {
          await tx.product.update({
            where: { id: variant.product_id },
            data: { updated_by: actor.user_id },
          });
          await this.audit.recordIn(tx, {
            action: "variant.updated",
            resource_type: "variant",
            resource_id: variantId,
            store_id: actor.store_id,
            actor_user_id: actor.user_id,
            metadata: { product_id: variant.product_id, changed },
            request_id: actor.request_id,
          });
        }
        return variant.product_id;
      });
    } catch (err) {
      if (input.sku && isSkuViolation(err)) throw skuTaken(input.sku);
      throw err;
    }
  }

  async bulkUpdate(
    productId: string,
    input: VariantBulkUpdate,
    actor: VariantActor,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: storeScoped(actor.store_id, { id: productId, ...LIVE }),
      });
      if (!product) throw AppException.notFound("Product");
      const variants = await tx.productVariant.findMany({
        where: { id: { in: input.variant_ids }, product_id: productId, ...LIVE },
      });
      if (variants.length !== new Set(input.variant_ids).size) {
        throw new AppException(
          CATALOG_ERROR_CODES.VARIANT_NOT_FOUND,
          "Some variants were not found on this product.",
          HttpStatus.NOT_FOUND,
        );
      }
      const errors: FieldError[] = [];
      for (const v of variants) {
        try {
          await this.applyFields(tx, actor.store_id, v, input.set);
        } catch (err) {
          if (err instanceof AppException && err.fields?.length) {
            errors.push(...err.fields.map((f) => ({ ...f, message: `${v.title}: ${f.message}` })));
          } else throw err;
        }
      }
      if (errors.length)
        throw AppException.validation(errors, "Some variants couldn't be updated.");
      await tx.product.update({ where: { id: productId }, data: { updated_by: actor.user_id } });
      await this.audit.recordIn(tx, {
        action: "variant.bulk_updated",
        resource_type: "product",
        resource_id: productId,
        store_id: actor.store_id,
        actor_user_id: actor.user_id,
        metadata: { variant_ids: input.variant_ids, set: input.set },
        request_id: actor.request_id,
      });
    });
  }

  /**
   * Validates and writes per-variant fields: SKU uniqueness, compare-at vs
   * stored price, variant image belongs to the product, low-stock threshold.
   * Returns the names of fields that actually changed.
   */
  async applyFields(
    tx: Tx,
    storeId: string,
    v: ProductVariant,
    input: VariantFieldInput,
  ): Promise<string[]> {
    const data: Prisma.ProductVariantUpdateInput = {};
    const changed: string[] = [];

    if (input.sku !== undefined && input.sku !== v.sku) {
      if (input.sku) {
        const clash = await tx.productVariant.findFirst({
          where: storeScoped(storeId, { sku: input.sku, ...LIVE, NOT: { id: v.id } }),
          select: { id: true },
        });
        if (clash) throw skuTaken(input.sku);
      }
      data.sku = input.sku;
      changed.push("sku");
    }
    if (input.barcode !== undefined && input.barcode !== v.barcode) {
      data.barcode = input.barcode;
      changed.push("barcode");
    }

    const price = {
      price_minor: num(v.price_minor),
      compare_at_minor: num(v.compare_at_minor),
      cost_minor: num(v.cost_minor),
    };
    for (const f of ["price_minor", "compare_at_minor", "cost_minor"] as const) {
      if (input[f] !== undefined && input[f] !== price[f]) {
        price[f] = input[f] ?? null;
        data[f] = big(input[f]);
        changed.push(f);
      }
    }
    if (
      price.compare_at_minor !== null &&
      price.price_minor !== null &&
      price.compare_at_minor <= price.price_minor
    ) {
      throw AppException.validation([
        {
          path: "compare_at_minor",
          message: "Compare-at price must be higher than the price.",
          code: "too_low",
        },
      ]);
    }

    for (const f of ["inventory_tracking", "continue_selling"] as const) {
      if (input[f] !== undefined && input[f] !== v[f]) {
        data[f] = input[f];
        changed.push(f);
      }
    }

    if (input.media_asset_id !== undefined && input.media_asset_id !== v.media_asset_id) {
      if (input.media_asset_id) {
        const onProduct = await tx.productMedia.findFirst({
          where: { product_id: v.product_id, media_asset_id: input.media_asset_id },
        });
        if (!onProduct) {
          throw AppException.validation([
            {
              path: "media_asset_id",
              message: "Choose one of the product's images.",
              code: "not_on_product",
            },
          ]);
        }
      }
      (data as Record<string, unknown>).media_asset_id = input.media_asset_id;
      changed.push("media_asset_id");
    }

    if (Object.keys(data).length) await tx.productVariant.update({ where: { id: v.id }, data });

    if (input.low_stock_threshold !== undefined) {
      const loc = await this.inventory.defaultLocation(tx, storeId);
      const level = await tx.inventoryLevel.findUnique({
        where: { variant_id_location_id: { variant_id: v.id, location_id: loc.id } },
      });
      if ((level?.low_stock_threshold ?? null) !== input.low_stock_threshold) {
        await this.inventory.setThreshold(tx, storeId, v.id, input.low_stock_threshold);
        changed.push("low_stock_threshold");
      }
    }
    return changed;
  }

  // ───────────── Helpers ─────────────

  private async lockVariant(tx: Tx, storeId: string, variantId: string): Promise<ProductVariant> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id AND p.deleted_at IS NULL
      WHERE v.id = ${variantId}::uuid AND v.store_id = ${storeId}::uuid AND v.deleted_at IS NULL
      FOR UPDATE OF v`;
    if (!rows.length) {
      throw new AppException(
        CATALOG_ERROR_CODES.VARIANT_NOT_FOUND,
        "Variant not found.",
        HttpStatus.NOT_FOUND,
      );
    }
    return tx.productVariant.findUniqueOrThrow({ where: { id: variantId } });
  }

  private async loadExisting(
    client: Pick<Tx, "product" | "productVariant">,
    storeId: string,
    productId: string,
  ) {
    const product = await client.product.findFirst({
      where: storeScoped(storeId, { id: productId, ...LIVE }),
      select: { id: true },
    });
    if (!product) throw AppException.notFound("Product");
    const rows = await client.productVariant.findMany({
      where: { product_id: productId, ...LIVE },
      orderBy: { position: "asc" },
      include: {
        option_values: { include: { option_value: { include: { option: true } } } },
        inventory: true,
      },
    });
    const variants: ExistingVariant[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      position: r.position,
      values: Object.fromEntries(
        r.option_values.map((ov) => [ov.option_value.option.name, ov.option_value.value]),
      ),
    }));
    const onHand = new Map(rows.map((r) => [r.id, r.inventory.reduce((n, l) => n + l.on_hand, 0)]));
    const skus = new Map(rows.map((r) => [r.id, r.sku]));
    return { rows, variants, onHand, skus };
  }

  private describe(
    plan: Plan,
    onHand: Map<string, number>,
    skus: Map<string, string | null>,
  ): VariantPlan {
    return {
      keep: plan.keep.map((k) => ({
        variant_id: k.variant_id,
        from_title: k.from_title,
        title: comboTitle(k.combination),
      })),
      create: plan.create.map((c) => ({ title: comboTitle(c) })),
      remove: plan.remove.map((r) => ({
        variant_id: r.id,
        title: r.title,
        sku: skus.get(r.id) ?? null,
        on_hand: onHand.get(r.id) ?? 0,
      })),
      total_after: plan.ordered.length,
    };
  }
}
