import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, storeScoped, type Product, type ProductVariant } from "@cartforge/database";
import {
  CATALOG_ERROR_CODES,
  ERROR_CODES,
  type ActorSummary,
  type BulkResult,
  type FieldError,
  type ListResponse,
  type ProductDetail,
  type ProductListItem,
} from "@cartforge/types";
import {
  normalizeTag,
  slugify,
  type ProductBulk,
  type ProductDuplicate,
  type ProductCreate,
  type ProductListQuery,
  type ProductUpdate,
} from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { CategoriesService } from "../catalog/categories.service";
import { CollectionsService } from "../catalog/collections.service";
import { recordRedirect } from "../catalog/redirects";
import { OutboxService } from "../common/outbox.service";
import { AppException } from "../common/app-exception";
import { sanitizeRichText } from "../common/sanitize-html";
import { InventoryService } from "../inventory/inventory.service";
import { MEDIA_RESOURCE, MediaService } from "../media/media.service";
import { PrismaService } from "../prisma/prisma.service";
import { toDetail, toListItem, type ListAggregates } from "./product.mapper";
import { VariantsService, isSkuViolation, skuTaken } from "./variants.service";
import { publishErrors, type PublishCandidate } from "./publish-rules";

export interface ActorContext {
  store_id: string;
  user_id: string;
  can_publish: boolean;
  /** Required to set initial stock on create (inventory.adjust). */
  can_adjust_inventory?: boolean;
  request_id?: string;
  ip?: string;
}

type Tx = Prisma.TransactionClient;
type MediaInput = NonNullable<ProductUpdate["media"]>;
type PricingInput = Pick<ProductUpdate, "price_minor" | "compare_at_minor" | "cost_minor">;

const LIVE = { deleted_at: null } as const;
const MAX_HANDLE_ATTEMPTS = 50;

/** Fields recorded in audit before/after (description is noted, not copied). */
const AUDITED_FIELDS = ["title", "handle", "product_type", "vendor", "status", "taxable"] as const;
const PRICE_FIELDS = ["price_minor", "compare_at_minor", "cost_minor"] as const;

const MEDIA_INCLUDE = {
  orderBy: { position: "asc" },
  include: { asset: { include: { derivatives: true } } },
} as const satisfies Prisma.Product$mediaArgs;

const VARIANT_INCLUDE = {
  option_values: { include: { option_value: { include: { option: true } } } },
  inventory: true,
} as const satisfies Prisma.ProductVariantInclude;

const INVENTORY_FIELDS = [
  "sku",
  "barcode",
  "inventory_tracking",
  "continue_selling",
  "low_stock_threshold",
] as const;

const ORGANIZATION_INCLUDE = {
  categories: { include: { category: true } },
  collections: { include: { collection: true } },
  tags: { include: { tag: true } },
} as const;

type OrganizationInput = Pick<ProductUpdate, "category_ids" | "collection_ids" | "tags">;

const big = (v: number | null | undefined) => (v === null || v === undefined ? null : BigInt(v));
const num = (v: bigint | null) => (v === null ? null : Number(v));

function handleTaken(handle: string) {
  return AppException.conflict(
    "Another product in this store already uses this handle.",
    [{ path: "handle", message: `The handle "${handle}" is already in use.`, code: "taken" }],
    CATALOG_ERROR_CODES.PRODUCT_HANDLE_TAKEN,
  );
}

function isHandleViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = err.meta?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return text.includes("handle");
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly variants: VariantsService,
    private readonly inventory: InventoryService,
    private readonly categories: CategoriesService,
    private readonly collections: CollectionsService,
    private readonly outbox: OutboxService,
  ) {}

  // ───────────── Queries ─────────────

  async list(
    storeId: string,
    q: ProductListQuery,
  ): Promise<Omit<ListResponse<ProductListItem>, "request_id">> {
    const where: Prisma.ProductWhereInput = storeScoped(storeId, {
      ...LIVE,
      ...(q.status && { status: { in: q.status } }),
      ...(q.product_type && { product_type: { in: q.product_type } }),
      ...(q.category_id && { categories: { some: { category_id: q.category_id } } }),
      ...(q.collection_id && { collections: { some: { collection_id: q.collection_id } } }),
      ...(q.tag && { tags: { some: { tag: { normalized_name: normalizeTag(q.tag) } } } }),
      ...(q.q && {
        OR: [
          { title: { contains: q.q, mode: "insensitive" as const } },
          { handle: { contains: q.q.toLowerCase() } },
          { vendor: { contains: q.q, mode: "insensitive" as const } },
          {
            variants: {
              some: {
                ...LIVE,
                OR: [{ sku: { contains: q.q, mode: "insensitive" as const } }, { barcode: q.q }],
              },
            },
          },
        ],
      }),
    });

    const [total, rows, currency] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        // Secondary key on id keeps pagination stable when sort values tie.
        orderBy: [{ [q.sort]: q.order }, { id: "asc" }],
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
        include: {
          variants: {
            where: LIVE,
            orderBy: { position: "asc" },
            take: 1,
            select: { sku: true, price_minor: true },
          },
          media: {
            where: { is_primary: true },
            take: 1,
            include: { asset: { include: { derivatives: true } } },
          },
          _count: { select: { variants: { where: LIVE } } },
        },
      }),
      this.storeCurrency(this.prisma, storeId),
    ]);

    const aggs = await this.listAggregates(rows.map((r) => r.id));
    return {
      data: rows.map((r) => toListItem(r, currency, aggs.get(r.id))),
      meta: {
        page: q.page,
        page_size: q.page_size,
        total,
        total_pages: Math.ceil(total / q.page_size),
      },
    };
  }

  async get(storeId: string, id: string): Promise<ProductDetail> {
    const product = await this.prisma.product.findFirst({
      where: storeScoped(storeId, { id, ...LIVE }),
      include: {
        variants: { where: LIVE, orderBy: { position: "asc" }, include: VARIANT_INCLUDE },
        media: MEDIA_INCLUDE,
        options: { include: { values: true } },
        ...ORGANIZATION_INCLUDE,
      },
    });
    // Same 404 for "other store" and "missing" so IDs can't be probed (BE-012).
    if (!product) throw AppException.notFound("Product");
    const [currency, actors, location] = await Promise.all([
      this.storeCurrency(this.prisma, storeId),
      this.actors([product.created_by, product.updated_by]),
      this.inventory.defaultLocation(this.prisma, storeId),
    ]);
    const paths = product.categories.length
      ? new Map((await this.categories.list(storeId)).map((c) => [c.id, c.path]))
      : new Map<string, string>();
    return toDetail(product, currency, location.id, actors, paths);
  }

  // ───────────── Commands ─────────────

  async create(input: ProductCreate, ctx: ActorContext): Promise<ProductDetail> {
    if (input.status !== "draft" && !ctx.can_publish) throw this.publishForbidden();
    this.assertPricingAllowed(input.product_type, input);
    this.assertInventoryFieldsAllowed(input.product_type, input);
    if (input.inventory_quantity && !ctx.can_adjust_inventory) {
      throw new AppException(
        ERROR_CODES.FORBIDDEN,
        "You don't have permission to set stock quantities.",
        HttpStatus.FORBIDDEN,
        [
          {
            path: "inventory_quantity",
            message: "Requires the inventory adjust permission.",
            code: "forbidden",
          },
        ],
      );
    }
    if (input.sku) {
      const clash = await this.prisma.productVariant.findFirst({
        where: storeScoped(ctx.store_id, { sku: input.sku, ...LIVE }),
        select: { id: true },
      });
      if (clash) throw skuTaken(input.sku);
    }

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const currency = await this.storeCurrency(tx, ctx.store_id);
        const handle = input.handle
          ? await this.assertHandleFree(tx, ctx.store_id, input.handle)
          : await this.generateHandle(tx, ctx.store_id, input.title);

        if (input.status === "active") {
          this.assertPublishable({
            title: input.title,
            handle,
            product_type: input.product_type,
            variant_count: 1,
            price_minor: input.price_minor ?? null,
          });
        }

        const product = await tx.product.create({
          data: {
            store_id: ctx.store_id,
            title: input.title,
            description_html: sanitizeRichText(input.description_html),
            handle,
            product_type: input.product_type,
            vendor: input.vendor ?? null,
            status: input.status,
            taxable: input.taxable ?? true,
            seo_title: input.seo_title ?? null,
            seo_description: input.seo_description ?? null,
            published_at: input.status === "active" ? new Date() : null,
            created_by: ctx.user_id,
            updated_by: ctx.user_id,
            // Every product starts with one default variant (simple products keep exactly one).
            variants: {
              create: {
                store_id: ctx.store_id,
                title: "Default",
                position: 0,
                currency,
                price_minor: big(input.price_minor),
                compare_at_minor: big(input.compare_at_minor),
                cost_minor: big(input.cost_minor),
                sku: input.sku ?? null,
                barcode: input.barcode ?? null,
                inventory_tracking: input.inventory_tracking ?? true,
                continue_selling: input.continue_selling ?? false,
              },
            },
          },
          include: { variants: true },
        });

        // Stock level at the default location (+ initial stock as an immutable movement).
        const variant = product.variants[0]!;
        await this.inventory.setThreshold(
          tx,
          ctx.store_id,
          variant.id,
          input.low_stock_threshold ?? null,
        );
        if (input.inventory_quantity && (input.inventory_tracking ?? true)) {
          await this.inventory.applyInTx(tx, {
            store_id: ctx.store_id,
            variant_id: variant.id,
            mode: "set",
            quantity: input.inventory_quantity,
            type: "initial",
            reason: "Initial stock",
            reference: { type: "product", id: product.id },
            actor_id: ctx.user_id,
            request_id: ctx.request_id,
          });
        }

        if (input.media?.length) {
          await this.syncMedia(
            tx,
            ctx.store_id,
            product.id,
            input.media,
            input.primary_media_id ?? null,
          );
        }
        await this.syncOrganization(tx, ctx.store_id, product.id, input);
        await this.outbox.emit(tx, {
          store_id: ctx.store_id,
          event_type: "product.created",
          resource_type: "product",
          resource_id: product.id,
        });

        await this.audit.recordIn(tx, {
          action: "product.created",
          resource_type: "product",
          resource_id: product.id,
          store_id: ctx.store_id,
          actor_user_id: ctx.user_id,
          metadata: {
            after: {
              ...this.auditSnapshot(product),
              price_minor: input.price_minor ?? null,
              compare_at_minor: input.compare_at_minor ?? null,
              media_count: input.media?.length ?? 0,
            },
          },
          request_id: ctx.request_id,
          ip: ctx.ip,
        });
        return product.id;
      });
      return this.get(ctx.store_id, id);
    } catch (err) {
      if (input.handle && isHandleViolation(err)) throw handleTaken(input.handle);
      if (input.sku && isSkuViolation(err)) throw skuTaken(input.sku);
      throw err;
    }
  }

  async update(id: string, input: ProductUpdate, ctx: ActorContext): Promise<ProductDetail> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Lock the row so concurrent edits serialize rather than interleave checks.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM products WHERE id = ${id}::uuid AND store_id = ${ctx.store_id}::uuid AND deleted_at IS NULL FOR UPDATE`;
        if (!locked.length) throw AppException.notFound("Product");

        const current = await tx.product.findUniqueOrThrow({
          where: { id },
          include: {
            variants: { where: LIVE, orderBy: { position: "asc" } },
            media: { orderBy: { position: "asc" } },
          },
        });
        const variantCount = current.variants.length;
        const defaultVariant = current.variants[0];

        const data: Prisma.ProductUpdateInput = {};
        const changed = new Set<string>();
        const set = <K extends keyof Product>(key: K, value: Product[K]) => {
          if (current[key] !== value) {
            (data as Record<string, unknown>)[key] = value;
            changed.add(key);
          }
        };

        if (input.title !== undefined) set("title", input.title);
        if (input.vendor !== undefined) set("vendor", input.vendor);
        if (input.taxable !== undefined) set("taxable", input.taxable);
        if (input.seo_title !== undefined) set("seo_title", input.seo_title);
        if (input.seo_description !== undefined) set("seo_description", input.seo_description);
        if (await this.syncOrganization(tx, ctx.store_id, id, input)) changed.add("organization");
        if (input.description_html !== undefined)
          set("description_html", sanitizeRichText(input.description_html));

        if (input.handle !== undefined && input.handle !== current.handle) {
          // Changing a handle that has been public breaks links: require explicit
          // confirmation (redirect records arrive with Sprint 4, PRD §8.4 A).
          if (current.published_at && !input.confirm_handle_change) {
            throw new AppException(
              CATALOG_ERROR_CODES.HANDLE_CHANGE_REQUIRES_CONFIRMATION,
              "This product has been published. Changing its handle will break existing links.",
              HttpStatus.CONFLICT,
              [
                {
                  path: "handle",
                  message: "Confirm the handle change to continue.",
                  code: "confirmation_required",
                },
              ],
            );
          }
          set("handle", await this.assertHandleFree(tx, ctx.store_id, input.handle, id));
          // Published products keep their old URL working (PRD §8.4 A).
          if (current.published_at) {
            await recordRedirect(tx, {
              store_id: ctx.store_id,
              from: `/products/${current.handle}`,
              to: `/products/${input.handle}`,
              resource_type: "product",
              resource_id: id,
            });
          }
        }

        if (input.product_type !== undefined && input.product_type !== current.product_type) {
          if (input.product_type === "simple" && variantCount > 1) {
            throw new AppException(
              CATALOG_ERROR_CODES.PRODUCT_TYPE_CHANGE_BLOCKED,
              "This product has multiple variants. Remove extra variants before converting it to a simple product.",
              HttpStatus.CONFLICT,
              [
                {
                  path: "product_type",
                  message: "Remove extra variants first.",
                  code: "has_variants",
                },
              ],
            );
          }
          set("product_type", input.product_type);
        }
        const nextType =
          (data.product_type as Product["product_type"] | undefined) ?? current.product_type;
        this.assertPricingAllowed(nextType, input);
        this.assertInventoryFieldsAllowed(nextType, input);
        if (
          defaultVariant &&
          nextType === "simple" &&
          INVENTORY_FIELDS.some((f) => input[f] !== undefined)
        ) {
          const invChanged = await this.variants.applyFields(tx, ctx.store_id, defaultVariant, {
            sku: input.sku,
            barcode: input.barcode,
            inventory_tracking: input.inventory_tracking,
            continue_selling: input.continue_selling,
            low_stock_threshold: input.low_stock_threshold,
          });
          for (const f of invChanged) changed.add(f);
        }

        // ── Pricing on the default variant (compare-at checked against merged values) ──
        const priceBefore = defaultVariant ? this.priceSnapshot(defaultVariant) : null;
        const priceAfter = priceBefore ? { ...priceBefore } : null;
        if (defaultVariant && priceAfter) {
          for (const f of PRICE_FIELDS)
            if (input[f] !== undefined) priceAfter[f] = input[f] ?? null;
          this.assertCompareAt(priceAfter);
          const priceChanged = PRICE_FIELDS.some((f) => priceAfter[f] !== priceBefore![f]);
          if (priceChanged) {
            await tx.productVariant.update({
              where: { id: defaultVariant.id },
              data: {
                price_minor: big(priceAfter.price_minor),
                compare_at_minor: big(priceAfter.compare_at_minor),
                cost_minor: big(priceAfter.cost_minor),
              },
            });
            changed.add("pricing");
          }
        }

        // ── Media (replaces the ordered list) ──
        if (input.media !== undefined || input.primary_media_id !== undefined) {
          const nextMedia: MediaInput =
            input.media ??
            current.media.map((m) => ({ media_asset_id: m.media_asset_id, alt_text: m.alt_text }));
          // Omitted primary: keep the current one if it's still in the list, else the first image.
          const currentPrimary = current.media.find((m) => m.is_primary)?.media_asset_id ?? null;
          const primary =
            input.primary_media_id !== undefined
              ? input.primary_media_id
              : nextMedia.some((m) => m.media_asset_id === currentPrimary)
                ? currentPrimary
                : null;
          const before = JSON.stringify(
            current.media.map((m) => [m.media_asset_id, m.alt_text ?? null, m.is_primary]),
          );
          const after = await this.syncMedia(tx, ctx.store_id, id, nextMedia, primary);
          if (before !== JSON.stringify(after)) changed.add("media");
        }

        if (input.status !== undefined && input.status !== current.status) {
          if (!ctx.can_publish) throw this.publishForbidden();
          if (input.status === "active") {
            this.assertPublishable({
              title: (data.title as string | undefined) ?? current.title,
              handle: (data.handle as string | undefined) ?? current.handle,
              product_type: nextType,
              variant_count: variantCount,
              price_minor: priceAfter?.price_minor ?? null,
              unpriced_variants: current.variants
                .filter((v) => v.price_minor === null)
                .map((v) => v.title),
            });
            if (!current.published_at) data.published_at = new Date();
          }
          set("status", input.status);
        }

        if (!changed.size) return; // No-op: no write, no audit noise.

        data.updated_by = ctx.user_id;
        const updated = await tx.product.update({ where: { id }, data });
        await this.outbox.emit(tx, {
          store_id: ctx.store_id,
          event_type: changed.has("status")
            ? `product.${updated.status === "active" ? "published" : updated.status === "archived" ? "archived" : "unpublished"}`
            : "product.updated",
          resource_type: "product",
          resource_id: id,
          payload: { changed: [...changed] },
        });

        const fields = AUDITED_FIELDS.filter((f) => changed.has(f));
        await this.audit.recordIn(tx, {
          action: changed.has("status") ? `product.status.${updated.status}` : "product.updated",
          resource_type: "product",
          resource_id: id,
          store_id: ctx.store_id,
          actor_user_id: ctx.user_id,
          metadata: {
            changed: [...changed],
            before: {
              ...Object.fromEntries(fields.map((f) => [f, current[f]])),
              ...(changed.has("pricing") && priceBefore),
            },
            after: {
              ...Object.fromEntries(fields.map((f) => [f, updated[f]])),
              ...(changed.has("pricing") && priceAfter),
            },
          },
          request_id: ctx.request_id,
          ip: ctx.ip,
        });
      });
    } catch (err) {
      if (input.handle && isHandleViolation(err)) throw handleTaken(input.handle);
      throw err;
    }
    return this.get(ctx.store_id, id);
  }

  /**
   * Soft delete (PRD §8.9). Releases the product's media references so unused
   * images can be deleted; order item snapshots never depend on live product rows.
   */
  async remove(id: string, ctx: ActorContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: storeScoped(ctx.store_id, { id, ...LIVE }),
      });
      if (!product) throw AppException.notFound("Product");
      const now = new Date();
      await tx.productVariant.updateMany({
        where: { product_id: id, ...LIVE },
        data: { deleted_at: now },
      });
      await tx.productMedia.deleteMany({ where: { product_id: id } });
      await tx.mediaReference.deleteMany({
        where: { store_id: ctx.store_id, resource_type: MEDIA_RESOURCE.PRODUCT, resource_id: id },
      });
      await tx.product.update({
        where: { id },
        data: { deleted_at: now, updated_by: ctx.user_id },
      });
      await this.audit.recordIn(tx, {
        action: "product.deleted",
        resource_type: "product",
        resource_id: id,
        store_id: ctx.store_id,
        actor_user_id: ctx.user_id,
        metadata: { before: this.auditSnapshot(product) },
        request_id: ctx.request_id,
        ip: ctx.ip,
      });
      await this.outbox.emit(tx, {
        store_id: ctx.store_id,
        event_type: "product.deleted",
        resource_type: "product",
        resource_id: id,
      });
    });
  }

  // ───────────── Duplicate + bulk ─────────────

  /**
   * Copies a product as a new Draft (PRD §8.9): fields, options, variants with
   * prices and settings, images (as references — no binary copies), categories,
   * collections and tags. SKUs/barcodes are cleared (they must be unique) and
   * stock starts at zero.
   */
  async duplicate(id: string, input: ProductDuplicate, ctx: ActorContext): Promise<ProductDetail> {
    const newId = await this.prisma.$transaction(async (tx) => {
      const src = await tx.product.findFirst({
        where: storeScoped(ctx.store_id, { id, ...LIVE }),
        include: {
          variants: {
            where: LIVE,
            orderBy: { position: "asc" },
            include: { option_values: { include: { option_value: true } }, inventory: true },
          },
          options: {
            include: { values: { orderBy: { position: "asc" } } },
            orderBy: { position: "asc" },
          },
          media: { orderBy: { position: "asc" } },
          categories: true,
          collections: true,
          tags: true,
        },
      });
      if (!src) throw AppException.notFound("Product");
      const title = (input.title ?? `Copy of ${src.title}`).slice(0, 200);
      const handle = await this.generateHandle(tx, ctx.store_id, title);
      const location = await this.inventory.defaultLocation(tx, ctx.store_id);

      const copy = await tx.product.create({
        data: {
          store_id: ctx.store_id,
          title,
          handle,
          description_html: src.description_html,
          product_type: src.product_type,
          vendor: src.vendor,
          status: "draft",
          taxable: src.taxable,
          requires_shipping: src.requires_shipping,
          seo_title: src.seo_title,
          seo_description: src.seo_description,
          created_by: ctx.user_id,
          updated_by: ctx.user_id,
        },
      });

      const valueMap = new Map<string, string>();
      for (const o of src.options) {
        const created = await tx.productOption.create({
          data: {
            store_id: ctx.store_id,
            product_id: copy.id,
            name: o.name,
            position: o.position,
            values: {
              create: o.values.map((v) => ({
                store_id: ctx.store_id,
                value: v.value,
                position: v.position,
              })),
            },
          },
          include: { values: true },
        });
        for (const v of o.values)
          valueMap.set(v.id, created.values.find((n) => n.value === v.value)!.id);
      }

      const mediaIds = new Set(input.include_media ? src.media.map((m) => m.media_asset_id) : []);
      for (const v of src.variants) {
        const valueIds = v.option_values
          .map((ov) => valueMap.get(ov.option_value_id)!)
          .filter(Boolean);
        const threshold =
          v.inventory.find((l) => l.location_id === location.id)?.low_stock_threshold ?? null;
        await tx.productVariant.create({
          data: {
            store_id: ctx.store_id,
            product_id: copy.id,
            title: v.title,
            position: v.position,
            currency: v.currency,
            price_minor: v.price_minor,
            compare_at_minor: v.compare_at_minor,
            cost_minor: v.cost_minor,
            inventory_tracking: v.inventory_tracking,
            continue_selling: v.continue_selling,
            media_asset_id:
              v.media_asset_id && mediaIds.has(v.media_asset_id) ? v.media_asset_id : null,
            option_signature: [...valueIds].sort().join(","),
            option_values: { create: valueIds.map((option_value_id) => ({ option_value_id })) },
            inventory: {
              create: {
                store_id: ctx.store_id,
                location_id: location.id,
                low_stock_threshold: threshold,
              },
            },
          },
        });
      }

      if (input.include_media && src.media.length) {
        await tx.productMedia.createMany({
          data: src.media.map((m) => ({
            store_id: ctx.store_id,
            product_id: copy.id,
            media_asset_id: m.media_asset_id,
            position: m.position,
            is_primary: m.is_primary,
            alt_text: m.alt_text,
          })),
        });
        await tx.mediaReference.createMany({
          data: src.media.map((m) => ({
            store_id: ctx.store_id,
            media_asset_id: m.media_asset_id,
            resource_type: MEDIA_RESOURCE.PRODUCT,
            resource_id: copy.id,
          })),
        });
      }
      if (src.categories.length) {
        await tx.productCategory.createMany({
          data: src.categories.map((c) => ({
            product_id: copy.id,
            category_id: c.category_id,
            store_id: ctx.store_id,
          })),
        });
      }
      for (const c of src.collections)
        await this.appendToCollection(tx, ctx.store_id, c.collection_id, [copy.id]);
      if (src.tags.length) {
        await tx.productTagAssignment.createMany({
          data: src.tags.map((t) => ({ product_id: copy.id, tag_id: t.tag_id })),
        });
      }

      await this.audit.recordIn(tx, {
        action: "product.duplicated",
        resource_type: "product",
        resource_id: copy.id,
        store_id: ctx.store_id,
        actor_user_id: ctx.user_id,
        metadata: {
          source_id: src.id,
          include_media: input.include_media,
          variants: src.variants.length,
        },
        request_id: ctx.request_id,
        ip: ctx.ip,
      });
      await this.outbox.emit(tx, {
        store_id: ctx.store_id,
        event_type: "product.created",
        resource_type: "product",
        resource_id: copy.id,
      });
      return copy.id;
    });
    return this.get(ctx.store_id, newId);
  }

  /**
   * Bulk actions (PRD §8.3). Each product is processed independently so one
   * invalid product (e.g. not publishable) doesn't block the rest; failures are
   * reported per product with actionable errors.
   */
  async bulk(input: ProductBulk, ctx: ActorContext): Promise<BulkResult> {
    const products = await this.prisma.product.findMany({
      where: storeScoped(ctx.store_id, { id: { in: input.product_ids }, ...LIVE }),
      select: { id: true, title: true },
    });
    const titles = new Map(products.map((p) => [p.id, p.title]));
    const result: BulkResult = { action: input.action, succeeded: [], failed: [] };
    for (const id of input.product_ids) {
      if (!titles.has(id))
        result.failed.push({
          id,
          title: "",
          errors: [{ path: "id", message: "Product not found.", code: "not_found" }],
        });
    }
    const ids = input.product_ids.filter((id) => titles.has(id));

    // Validate targets once, up front.
    await this.prisma.$transaction(async (tx) => {
      if (input.category_ids)
        await this.categories.assertOwned(tx, ctx.store_id, input.category_ids);
      if (input.collection_ids)
        await this.collections.assertOwned(tx, ctx.store_id, input.collection_ids);
    });

    for (const id of ids) {
      try {
        switch (input.action) {
          case "publish":
          case "draft":
          case "archive":
            await this.update(id, this.statusChange(input.action), ctx);
            break;
          case "delete":
            await this.remove(id, ctx);
            break;
          default:
            await this.prisma.$transaction(async (tx) => {
              const org = await this.modifiedOrganization(tx, id, input);
              if (await this.syncOrganization(tx, ctx.store_id, id, org)) {
                await tx.product.update({ where: { id }, data: { updated_by: ctx.user_id } });
                await this.outbox.emit(tx, {
                  store_id: ctx.store_id,
                  event_type: "product.updated",
                  resource_type: "product",
                  resource_id: id,
                });
              }
            });
        }
        result.succeeded.push(id);
      } catch (err) {
        if (!(err instanceof AppException)) throw err;
        result.failed.push({
          id,
          title: titles.get(id) ?? "",
          errors: err.fields?.length
            ? err.fields
            : [{ path: "product", message: err.message, code: err.code }],
        });
      }
    }
    await this.audit.record({
      action: `product.bulk.${input.action}`,
      resource_type: "product",
      store_id: ctx.store_id,
      actor_user_id: ctx.user_id,
      metadata: {
        requested: input.product_ids.length,
        succeeded: result.succeeded.length,
        failed: result.failed.length,
      },
      request_id: ctx.request_id,
      ip: ctx.ip,
    });
    return result;
  }

  /** A status-only update (other fields untouched). */
  statusChange(action: "publish" | "draft" | "archive"): ProductUpdate {
    return {
      status: action === "publish" ? "active" : action === "draft" ? "draft" : "archived",
    } as ProductUpdate;
  }

  /** Current organization ± the bulk change, as a full replacement for syncOrganization. */
  private async modifiedOrganization(
    tx: Tx,
    id: string,
    input: ProductBulk,
  ): Promise<OrganizationInput> {
    const union = <T>(a: T[], b: T[]) => [...new Set([...a, ...b])];
    const minus = <T>(a: T[], b: T[]) => a.filter((x) => !b.includes(x));
    switch (input.action) {
      case "add_categories":
      case "remove_categories": {
        const cur = (await tx.productCategory.findMany({ where: { product_id: id } })).map(
          (c) => c.category_id,
        );
        return {
          category_ids:
            input.action === "add_categories"
              ? union(cur, input.category_ids!)
              : minus(cur, input.category_ids!),
        };
      }
      case "add_collections":
      case "remove_collections": {
        const cur = (await tx.collectionProduct.findMany({ where: { product_id: id } })).map(
          (c) => c.collection_id,
        );
        return {
          collection_ids:
            input.action === "add_collections"
              ? union(cur, input.collection_ids!)
              : minus(cur, input.collection_ids!),
        };
      }
      default: {
        const cur = (
          await tx.productTagAssignment.findMany({
            where: { product_id: id },
            include: { tag: true },
          })
        ).map((t) => t.tag.name);
        const targets = input.tags!.map(normalizeTag);
        return {
          tags:
            input.action === "add_tags"
              ? [...cur, ...input.tags!]
              : cur.filter((t) => !targets.includes(normalizeTag(t))),
        };
      }
    }
  }

  // ───────────── Organization ─────────────

  /**
   * Replaces categories / collections / tags when provided. Collections keep
   * existing positions; new memberships are appended. Returns true on change.
   */
  async syncOrganization(
    tx: Tx,
    storeId: string,
    productId: string,
    input: OrganizationInput,
  ): Promise<boolean> {
    let changed = false;
    if (input.category_ids) {
      await this.categories.assertOwned(tx, storeId, input.category_ids);
      const before = (await tx.productCategory.findMany({ where: { product_id: productId } })).map(
        (c) => c.category_id,
      );
      const want = new Set(input.category_ids);
      const remove = before.filter((c) => !want.has(c));
      const add = input.category_ids.filter((c) => !before.includes(c));
      if (remove.length)
        await tx.productCategory.deleteMany({
          where: { product_id: productId, category_id: { in: remove } },
        });
      if (add.length) {
        await tx.productCategory.createMany({
          data: add.map((category_id) => ({
            product_id: productId,
            category_id,
            store_id: storeId,
          })),
        });
      }
      changed ||= Boolean(remove.length || add.length);
    }
    if (input.collection_ids) {
      await this.collections.assertOwned(tx, storeId, input.collection_ids);
      const before = (
        await tx.collectionProduct.findMany({ where: { product_id: productId } })
      ).map((c) => c.collection_id);
      const want = new Set(input.collection_ids);
      const remove = before.filter((c) => !want.has(c));
      const add = input.collection_ids.filter((c) => !before.includes(c));
      if (remove.length)
        await tx.collectionProduct.deleteMany({
          where: { product_id: productId, collection_id: { in: remove } },
        });
      for (const collection_id of add)
        await this.appendToCollection(tx, storeId, collection_id, [productId]);
      changed ||= Boolean(remove.length || add.length);
    }
    if (input.tags) {
      const tagIds = await this.upsertTags(tx, storeId, input.tags);
      const before = (
        await tx.productTagAssignment.findMany({ where: { product_id: productId } })
      ).map((t) => t.tag_id);
      const want = new Set(tagIds);
      const remove = before.filter((t) => !want.has(t));
      const add = tagIds.filter((t) => !before.includes(t));
      if (remove.length)
        await tx.productTagAssignment.deleteMany({
          where: { product_id: productId, tag_id: { in: remove } },
        });
      if (add.length)
        await tx.productTagAssignment.createMany({
          data: add.map((tag_id) => ({ product_id: productId, tag_id })),
        });
      changed ||= Boolean(remove.length || add.length);
    }
    return changed;
  }

  private async appendToCollection(
    tx: Tx,
    storeId: string,
    collectionId: string,
    productIds: string[],
  ): Promise<void> {
    const max = await tx.collectionProduct.aggregate({
      where: { collection_id: collectionId },
      _max: { position: true },
    });
    let pos = (max._max.position ?? -1) + 1;
    await tx.collectionProduct.createMany({
      data: productIds.map((product_id) => ({
        collection_id: collectionId,
        product_id,
        store_id: storeId,
        position: pos++,
      })),
      skipDuplicates: true,
    });
  }

  /** Creates missing tags (case-insensitive) and returns their ids in input order. */
  private async upsertTags(tx: Tx, storeId: string, names: string[]): Promise<string[]> {
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const raw of names) {
      const name = raw.trim().replace(/\s+/g, " ").slice(0, 80);
      const norm = normalizeTag(name);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      const tag = await tx.productTag.upsert({
        where: { store_id_normalized_name: { store_id: storeId, normalized_name: norm } },
        update: {},
        create: { store_id: storeId, name, normalized_name: norm },
      });
      ids.push(tag.id);
    }
    return ids;
  }

  // ───────────── Helpers ─────────────

  /**
   * Replaces the product's ordered image list and keeps media_references in sync
   * (used for safe deletion). Returns the resulting [asset, alt, primary] tuples.
   */
  private async syncMedia(
    tx: Tx,
    storeId: string,
    productId: string,
    items: MediaInput,
    primaryId: string | null,
  ): Promise<[string, string | null, boolean][]> {
    const ids = items.map((m) => m.media_asset_id);
    await this.media.assertOwned(tx, storeId, ids);
    if (primaryId && !ids.includes(primaryId)) {
      throw AppException.validation([
        {
          path: "primary_media_id",
          message: "The primary image must be one of the product's images.",
          code: "invalid",
        },
      ]);
    }
    const primary = primaryId ?? ids[0] ?? null;

    await tx.productMedia.deleteMany({ where: { product_id: productId } });
    await tx.mediaReference.deleteMany({
      where: { store_id: storeId, resource_type: MEDIA_RESOURCE.PRODUCT, resource_id: productId },
    });
    if (items.length) {
      await tx.productMedia.createMany({
        data: items.map((m, i) => ({
          store_id: storeId,
          product_id: productId,
          media_asset_id: m.media_asset_id,
          position: i,
          is_primary: m.media_asset_id === primary,
          alt_text: m.alt_text ?? null,
        })),
      });
      await tx.mediaReference.createMany({
        data: ids.map((mediaId) => ({
          store_id: storeId,
          media_asset_id: mediaId,
          resource_type: MEDIA_RESOURCE.PRODUCT,
          resource_id: productId,
        })),
      });
    }
    return items.map((m) => [m.media_asset_id, m.alt_text ?? null, m.media_asset_id === primary]);
  }

  /** Variable products set SKU/stock settings per variant. */
  private assertInventoryFieldsAllowed(
    type: "simple" | "variable",
    input: Partial<Record<(typeof INVENTORY_FIELDS)[number], unknown>>,
  ): void {
    const given = INVENTORY_FIELDS.filter((f) => input[f] !== undefined && input[f] !== null);
    if (type === "variable" && given.length) {
      throw AppException.validation(
        given.map((f) => ({
          path: f,
          message: "Set this on each variant instead.",
          code: "variant_field",
        })),
        "Variable products manage SKU and stock per variant.",
      );
    }
  }

  /** Price range and available stock per product for list rows. */
  private async listAggregates(ids: string[]): Promise<Map<string, ListAggregates>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.$queryRaw<
      {
        product_id: string;
        price_min: bigint | null;
        price_max: bigint | null;
        available: bigint | null;
      }[]
    >`
      SELECT v.product_id,
             MIN(v.price_minor) AS price_min,
             MAX(v.price_minor) AS price_max,
             SUM(CASE WHEN v.inventory_tracking THEN COALESCE(l.on_hand, 0) - COALESCE(l.reserved, 0) END) AS available
      FROM product_variants v
      JOIN inventory_locations loc ON loc.store_id = v.store_id AND loc.is_default
      LEFT JOIN inventory_levels l ON l.variant_id = v.id AND l.location_id = loc.id
      WHERE v.deleted_at IS NULL AND v.product_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY v.product_id`;
    const n = (v: bigint | null) => (v === null ? null : Number(v));
    return new Map(
      rows.map((r) => [
        r.product_id,
        { price_min: n(r.price_min), price_max: n(r.price_max), available: n(r.available) },
      ]),
    );
  }

  /** Variable products are priced per variant (Sprint 3). */
  private assertPricingAllowed(type: "simple" | "variable", input: PricingInput): void {
    if (
      type === "variable" &&
      PRICE_FIELDS.some((f) => input[f] !== undefined && input[f] !== null)
    ) {
      throw new AppException(
        CATALOG_ERROR_CODES.PRICING_REQUIRES_VARIANTS,
        "Variable products are priced per variant.",
        HttpStatus.UNPROCESSABLE_ENTITY,
        PRICE_FIELDS.filter((f) => input[f] != null).map((f) => ({
          path: f,
          message: "Set prices on each variant instead.",
          code: "variant_pricing",
        })),
      );
    }
  }

  private assertCompareAt(p: {
    price_minor: number | null;
    compare_at_minor: number | null;
  }): void {
    if (
      p.compare_at_minor !== null &&
      p.price_minor !== null &&
      p.compare_at_minor <= p.price_minor
    ) {
      throw AppException.validation([
        {
          path: "compare_at_minor",
          message: "Compare-at price must be higher than the price.",
          code: "too_low",
        },
      ]);
    }
  }

  private priceSnapshot(v: ProductVariant) {
    return {
      price_minor: num(v.price_minor),
      compare_at_minor: num(v.compare_at_minor),
      cost_minor: num(v.cost_minor),
    };
  }

  private async storeCurrency(client: Pick<Tx, "store">, storeId: string): Promise<string> {
    const store = await client.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { currency: true },
    });
    return store.currency;
  }

  private async assertHandleFree(
    tx: Tx,
    storeId: string,
    handle: string,
    exceptId?: string,
  ): Promise<string> {
    const clash = await tx.product.findFirst({
      where: storeScoped(storeId, { handle, ...LIVE, ...(exceptId && { NOT: { id: exceptId } }) }),
      select: { id: true },
    });
    if (clash) throw handleTaken(handle);
    return handle;
  }

  /** Title-derived handle, suffixed -2, -3… until unique within the store. */
  private async generateHandle(tx: Tx, storeId: string, title: string): Promise<string> {
    const base = slugify(title, 240) || "product";
    const existing = await tx.product.findMany({
      where: storeScoped(storeId, {
        ...LIVE,
        OR: [{ handle: base }, { handle: { startsWith: `${base}-` } }],
      }),
      select: { handle: true },
    });
    const used = new Set(existing.map((e) => e.handle));
    if (!used.has(base)) return base;
    for (let n = 2; n < MAX_HANDLE_ATTEMPTS + 2; n++) {
      const candidate = `${base}-${n}`;
      if (!used.has(candidate)) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  private assertPublishable(candidate: PublishCandidate): void {
    const errors: FieldError[] = publishErrors(candidate);
    if (errors.length) {
      throw new AppException(
        CATALOG_ERROR_CODES.PRODUCT_NOT_PUBLISHABLE,
        "This product can't be published yet. Fix the highlighted fields.",
        HttpStatus.UNPROCESSABLE_ENTITY,
        errors,
      );
    }
  }

  private publishForbidden() {
    return new AppException(
      ERROR_CODES.FORBIDDEN,
      "You don't have permission to change product visibility.",
      HttpStatus.FORBIDDEN,
      [{ path: "status", message: "Requires the publish permission.", code: "forbidden" }],
    );
  }

  private auditSnapshot(p: Product) {
    return Object.fromEntries(AUDITED_FIELDS.map((f) => [f, p[f]]));
  }

  private async actors(ids: (string | null)[]): Promise<Map<string, ActorSummary>> {
    const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u]));
  }
}
