import { readFile } from "node:fs/promises";
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import {
  categoryCreateSchema,
  collectionCreateSchema,
  inventoryAdjustSchema,
  productCreateSchema,
  productOptionsApplySchema,
  variantUpdateSchema,
  type StoreTransfer,
} from "@cartforge/validation";
import {
  PLATFORM_ERROR_CODES,
  type ProductDetail,
  type StoreTransferResult,
} from "@cartforge/types";
import { AppException } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CategoriesService } from "../catalog/categories.service";
import { CollectionsService } from "../catalog/collections.service";
import { InventoryService } from "../inventory/inventory.service";
import { MediaService } from "../media/media.service";
import { LocalStorageDriver } from "../storage/local.driver";
import { STORAGE_DRIVER, type StorageDriver } from "../storage/storage.driver";
import { StorefrontRevalidator } from "../storefront/revalidation";
import { ProductsService, type ActorContext } from "./products.service";
import { VariantsService } from "./variants.service";

/** Products per request, so one call stays well inside serverless time limits. */
export const TRANSFER_BATCH = 4;

export interface TransferAdmin {
  user_id: string;
  request_id?: string;
}

/**
 * Platform admin: copies a store's draft/active products into another store
 * through the normal services (validation, audit, outbox), then — for "move" —
 * archives the originals. Images are re-uploaded so stores never share files.
 * Idempotent: a product whose handle already exists in the target is not copied
 * again. Works in batches; the caller repeats until `remaining` is 0.
 */
@Injectable()
export class StoreTransferService {
  private readonly logger = new Logger(StoreTransferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: ProductsService,
    private readonly variants: VariantsService,
    private readonly inventory: InventoryService,
    private readonly media: MediaService,
    private readonly categories: CategoriesService,
    private readonly collections: CollectionsService,
    private readonly revalidator: StorefrontRevalidator,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async transfer(
    fromId: string,
    input: StoreTransfer,
    admin: TransferAdmin,
  ): Promise<StoreTransferResult> {
    if (fromId === input.to_store_id)
      throw new AppException(
        PLATFORM_ERROR_CODES.SAME_STORE,
        "Choose a different store to send the products to.",
        HttpStatus.UNPROCESSABLE_ENTITY,
        [{ path: "to_store_id", message: "Choose a different store", code: "same_store" }],
      );
    const [from, to] = await Promise.all(
      [fromId, input.to_store_id].map((id) =>
        this.prisma.store.findUnique({
          where: { id },
          select: { id: true, name: true, currency: true },
        }),
      ),
    );
    if (!from) throw AppException.notFound("Store");
    if (!to)
      throw new AppException(
        "NOT_FOUND",
        "Target store not found.",
        HttpStatus.UNPROCESSABLE_ENTITY,
        [{ path: "to_store_id", message: "Store not found", code: "not_found" }],
      );
    let rate = 1;
    if (from.currency !== to.currency) {
      if (input.price_rate === undefined)
        throw new AppException(
          PLATFORM_ERROR_CODES.PRICE_RATE_REQUIRED,
          `${from.name} uses ${from.currency} and ${to.name} uses ${to.currency}. Give a price rate (1 keeps the same numbers).`,
          HttpStatus.UNPROCESSABLE_ENTITY,
          [
            {
              path: "price_rate",
              message: "Required: the stores use different currencies",
              code: "required",
            },
          ],
        );
      rate = input.price_rate;
    }

    const pending = await this.pending(from.id, to.id, input.mode);
    const batch = pending.slice(0, TRANSFER_BATCH);
    const done: StoreTransferResult["done"] = [];
    const failed: StoreTransferResult["failed"] = [];
    const ctx = (store_id: string): ActorContext => ({
      store_id,
      user_id: admin.user_id,
      can_publish: true,
      can_adjust_inventory: true,
      request_id: admin.request_id,
    });

    for (const p of batch) {
      const src = await this.products.get(from.id, p.id);
      try {
        if (p.in_target) done.push({ title: src.title, result: "already_there" });
        else {
          await this.copy(src, ctx(to.id), rate);
          done.push({ title: src.title, result: "copied" });
        }
        if (input.mode === "move")
          await this.products.update(src.id, this.products.statusChange("archive"), ctx(from.id));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`transfer of ${src.id} failed: ${message}`);
        failed.push({ title: src.title, message });
      }
    }

    await this.audit.record({
      action: "platform.products_transferred",
      resource_type: "store",
      resource_id: from.id,
      store_id: from.id,
      actor_user_id: admin.user_id,
      metadata: {
        to_store_id: to.id,
        mode: input.mode,
        price_rate: String(rate),
        copied: String(done.filter((d) => d.result === "copied").length),
        failed: String(failed.length),
      },
      request_id: admin.request_id,
    });
    if (done.length)
      await this.revalidator.notify([`catalog:${from.id}`, `catalog:${to.id}`]).catch(() => {});

    return {
      from,
      to,
      mode: input.mode,
      done,
      failed,
      remaining: (await this.pending(from.id, to.id, input.mode)).length,
    };
  }

  /** Source products still to handle, oldest first. */
  private async pending(fromId: string, toId: string, mode: "move" | "copy") {
    const [src, dst] = await Promise.all([
      this.prisma.product.findMany({
        where: { store_id: fromId, deleted_at: null, status: { in: ["draft", "active"] } },
        orderBy: { created_at: "asc" },
        select: { id: true, handle: true },
      }),
      this.prisma.product.findMany({
        where: { store_id: toId, deleted_at: null },
        select: { handle: true },
      }),
    ]);
    const there = new Set(dst.map((d) => d.handle));
    return src
      .map((p) => ({ ...p, in_target: there.has(p.handle) }))
      .filter((p) => mode === "move" || !p.in_target);
  }

  private async copy(src: ProductDetail, ctx: ActorContext, rate: number): Promise<void> {
    const price = (v: number | null) => (v == null ? null : Math.round(v * rate));
    const prices = (v: {
      price_minor: number | null;
      compare_at_minor: number | null;
      cost_minor: number | null;
    }) => {
      const p = price(v.price_minor);
      const c = price(v.compare_at_minor);
      // Rounding can make compare-at equal to the price; it must stay higher.
      return {
        price_minor: p,
        compare_at_minor: c != null && p != null && c <= p ? null : c,
        cost_minor: price(v.cost_minor),
      };
    };

    const mediaIds = new Map<string, string>();
    for (const m of src.media)
      mediaIds.set(m.media_asset_id, await this.copyImage(m.media_asset_id, ctx));
    const primary = src.media.find((m) => m.is_primary)?.media_asset_id;

    const category_ids: string[] = [];
    for (const c of src.categories)
      category_ids.push(await this.category(src.categories, c.id, ctx));
    const collection_ids: string[] = [];
    for (const c of src.collections) collection_ids.push(await this.collection(c.id, ctx));

    const simple = src.product_type === "simple";
    const d = src.variants[0];
    const created = await this.products.create(
      productCreateSchema.parse({
        title: src.title,
        handle: src.handle,
        description_html: src.description_html,
        vendor: src.vendor ?? undefined,
        status: "draft",
        taxable: src.taxable,
        tags: src.tags,
        seo_title: src.seo_title,
        seo_description: src.seo_description,
        category_ids,
        collection_ids,
        media: src.media.map((m) => ({
          media_asset_id: mediaIds.get(m.media_asset_id)!,
          alt_text: m.alt_text,
        })),
        primary_media_id: primary ? mediaIds.get(primary) : undefined,
        ...(simple && d
          ? {
              ...prices(d),
              sku: d.sku,
              barcode: d.barcode,
              inventory_tracking: d.inventory_tracking,
              continue_selling: d.continue_selling,
              low_stock_threshold: d.inventory.low_stock_threshold,
              ...(d.inventory_tracking && d.inventory.on_hand > 0
                ? { inventory_quantity: d.inventory.on_hand }
                : {}),
            }
          : {}),
      }),
      ctx,
    );

    try {
      if (!simple) {
        const options = [...src.options]
          .sort((a, b) => a.position - b.position)
          .map((o) => ({
            name: o.name,
            values: [...o.values].sort((a, b) => a.position - b.position).map((v) => v.value),
          }));
        await this.variants.apply(created.id, productOptionsApplySchema.parse({ options }), ctx);
        const target = await this.products.get(ctx.store_id, created.id);
        const byKey = new Map(target.variants.map((v) => [variantKey(v), v]));
        for (const sv of src.variants) {
          const tv = byKey.get(variantKey(sv));
          if (!tv) throw new Error(`Variant "${sv.title}" could not be recreated`);
          await this.variants.update(
            tv.id,
            variantUpdateSchema.parse({
              ...prices(sv),
              sku: sv.sku,
              barcode: sv.barcode,
              inventory_tracking: sv.inventory_tracking,
              continue_selling: sv.continue_selling,
              low_stock_threshold: sv.inventory.low_stock_threshold,
              media_asset_id: sv.media_asset_id ? (mediaIds.get(sv.media_asset_id) ?? null) : null,
            }),
            ctx,
          );
          if (sv.inventory_tracking && sv.inventory.on_hand > 0)
            await this.inventory.adjust(
              inventoryAdjustSchema.parse({
                variant_id: tv.id,
                mode: "set",
                quantity: sv.inventory.on_hand,
                reason: "received",
              }),
              ctx,
            );
        }
      }
      if (src.status === "active")
        await this.products.update(created.id, this.products.statusChange("publish"), ctx);
    } catch (err) {
      // Never leave a half-copied product behind: a re-run would skip it as "already there".
      await this.products.remove(created.id, ctx).catch(() => {});
      throw err;
    }
  }

  /** Re-uploads an image into the target store (same bytes; deduplicated there). */
  private async copyImage(assetId: string, ctx: ActorContext): Promise<string> {
    const asset = await this.prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
    let buffer: Buffer;
    if (asset.storage_driver === "local" && this.storage instanceof LocalStorageDriver) {
      buffer = await readFile(this.storage.resolve(asset.storage_key));
    } else {
      const res = await fetch(asset.url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Image could not be read (${res.status})`);
      buffer = Buffer.from(await res.arrayBuffer());
    }
    const uploaded = await this.media.upload(
      { buffer, originalname: asset.original_filename ?? "image" },
      asset.alt_text,
      ctx,
    );
    return uploaded.id;
  }

  /** Same category path in the target store, created (with its parents) when missing. */
  private async category(
    srcCats: ProductDetail["categories"],
    srcId: string,
    ctx: ActorContext,
  ): Promise<string> {
    const src = await this.prisma.category.findUniqueOrThrow({ where: { id: srcId } });
    const all = await this.categories.list(ctx.store_id);
    const path = srcCats.find((c) => c.id === srcId)?.path ?? (await this.pathOf(srcId));
    const found = all.find((c) => c.path.toLowerCase() === path.toLowerCase());
    if (found) return found.id;
    const parent = src.parent_id ? await this.category(srcCats, src.parent_id, ctx) : null;
    const made = await this.categories.create(
      categoryCreateSchema.parse({
        name: src.name,
        parent_id: parent,
        description_html: src.description_html,
        seo_title: src.seo_title,
        seo_description: src.seo_description,
      }),
      ctx,
    );
    return made.id;
  }

  private async pathOf(categoryId: string): Promise<string> {
    const names: string[] = [];
    let id: string | null = categoryId;
    while (id) {
      const c: { name: string; parent_id: string | null } =
        await this.prisma.category.findUniqueOrThrow({
          where: { id },
          select: { name: true, parent_id: true },
        });
      names.unshift(c.name);
      id = c.parent_id;
    }
    return names.join(" › ");
  }

  /** Collection with the same title in the target store, created when missing. */
  private async collection(srcId: string, ctx: ActorContext): Promise<string> {
    const src = await this.prisma.collection.findUniqueOrThrow({ where: { id: srcId } });
    const found = await this.prisma.collection.findFirst({
      where: {
        store_id: ctx.store_id,
        title: { equals: src.title, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (found) return found.id;
    const made = await this.collections.create(
      collectionCreateSchema.parse({
        title: src.title,
        description_html: src.description_html,
        status: src.status === "archived" ? "draft" : src.status,
        sort_order: src.sort_order,
        seo_title: src.seo_title,
        seo_description: src.seo_description,
      }),
      ctx,
    );
    return made.id;
  }
}

const variantKey = (v: { option_values: { option: string; value: string }[] }) =>
  v.option_values
    .map((o) => `${o.option}=${o.value}`.toLowerCase())
    .sort()
    .join("|");
