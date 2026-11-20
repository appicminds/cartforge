import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, storeScoped, type Collection } from "@cartforge/database";
import {
  CATALOG_ERROR_CODES,
  type CollectionDetail,
  type CollectionProductItem,
  type CollectionSummary,
  type ListResponse,
} from "@cartforge/types";
import type {
  CollectionCreate,
  CollectionListQuery,
  CollectionProducts,
  CollectionUpdate,
} from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { OutboxService } from "../common/outbox.service";
import { sanitizeRichText } from "../common/sanitize-html";
import { PrismaService } from "../prisma/prisma.service";
import type { CatalogActor } from "./categories.service";
import { nextFreeHandle } from "./handles";
import { recordRedirect } from "./redirects";

type Tx = Prisma.TransactionClient;

const notFound = () =>
  new AppException(
    CATALOG_ERROR_CODES.COLLECTION_NOT_FOUND,
    "Collection not found.",
    HttpStatus.NOT_FOUND,
  );
const handleTaken = (handle: string) =>
  AppException.conflict(
    "Another collection already uses this handle.",
    [{ path: "handle", message: `The handle "${handle}" is already in use.`, code: "taken" }],
    CATALOG_ERROR_CODES.COLLECTION_HANDLE_TAKEN,
  );

/** Manually curated collections with ordered membership (PRD §8.6). */
@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(
    storeId: string,
    q: CollectionListQuery,
  ): Promise<Omit<ListResponse<CollectionSummary>, "request_id">> {
    const where: Prisma.CollectionWhereInput = storeScoped(storeId, {
      ...(q.status && { status: q.status }),
      ...(q.q && { title: { contains: q.q, mode: "insensitive" as const } }),
    });
    const [total, rows] = await Promise.all([
      this.prisma.collection.count({ where }),
      this.prisma.collection.findMany({
        where,
        orderBy: [{ title: "asc" }, { id: "asc" }],
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
        include: { _count: { select: { products: { where: { product: { deleted_at: null } } } } } },
      }),
    ]);
    return {
      data: rows.map((r) => this.toSummary(r, r._count.products)),
      meta: {
        page: q.page,
        page_size: q.page_size,
        total,
        total_pages: Math.ceil(total / q.page_size),
      },
    };
  }

  async get(storeId: string, id: string): Promise<CollectionDetail> {
    const c = await this.prisma.collection.findFirst({ where: storeScoped(storeId, { id }) });
    if (!c) throw notFound();
    const products = await this.members(storeId, id);
    return { ...this.toSummary(c, products.length), products };
  }

  async create(input: CollectionCreate, actor: CatalogActor): Promise<CollectionDetail> {
    const id = await this.prisma.$transaction(async (tx) => {
      const handle = await this.resolveHandle(tx, actor.store_id, input.handle, input.title);
      const c = await tx.collection.create({
        data: {
          store_id: actor.store_id,
          title: input.title,
          handle,
          description_html: sanitizeRichText(input.description_html ?? ""),
          status: input.status ?? "draft",
          sort_order: input.sort_order ?? "manual",
          seo_title: input.seo_title ?? null,
          seo_description: input.seo_description ?? null,
          created_by: actor.user_id,
          updated_by: actor.user_id,
        },
      });
      await this.record(tx, actor, "collection.created", c.id, { title: c.title });
      return c.id;
    });
    return this.get(actor.store_id, id);
  }

  async update(
    id: string,
    input: CollectionUpdate,
    actor: CatalogActor,
  ): Promise<CollectionDetail> {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.collection.findFirst({ where: storeScoped(actor.store_id, { id }) });
      if (!c) throw notFound();
      const data: Prisma.CollectionUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.handle !== undefined && input.handle !== c.handle) {
        if (c.status === "active" && !input.confirm_handle_change) {
          throw new AppException(
            CATALOG_ERROR_CODES.HANDLE_CHANGE_REQUIRES_CONFIRMATION,
            "This collection is live. Changing its handle changes its address; old links will redirect.",
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
        data.handle = await this.resolveHandle(tx, actor.store_id, input.handle, input.handle, id);
        if (c.status === "active") {
          await recordRedirect(tx, {
            store_id: actor.store_id,
            from: `/collections/${c.handle}`,
            to: `/collections/${input.handle}`,
            resource_type: "collection",
            resource_id: id,
          });
        }
      }
      if (input.description_html !== undefined)
        data.description_html = sanitizeRichText(input.description_html);
      if (input.status !== undefined) data.status = input.status;
      if (input.sort_order !== undefined) data.sort_order = input.sort_order;
      if (input.seo_title !== undefined) data.seo_title = input.seo_title;
      if (input.seo_description !== undefined) data.seo_description = input.seo_description;
      if (!Object.keys(data).length) return;
      data.updated_by = actor.user_id;
      await tx.collection.update({ where: { id }, data });
      await this.record(tx, actor, "collection.updated", id, {
        changed: Object.keys(data).filter((k) => k !== "updated_by"),
      });
    });
    return this.get(actor.store_id, id);
  }

  /** Replaces membership; order = display order when the collection is sorted manually. */
  async setProducts(
    id: string,
    input: CollectionProducts,
    actor: CatalogActor,
  ): Promise<CollectionDetail> {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.collection.findFirst({ where: storeScoped(actor.store_id, { id }) });
      if (!c) throw notFound();
      await this.assertProducts(tx, actor.store_id, input.product_ids);
      const before = await tx.collectionProduct.findMany({
        where: { collection_id: id },
        select: { product_id: true },
      });
      await tx.collectionProduct.deleteMany({ where: { collection_id: id } });
      if (input.product_ids.length) {
        await tx.collectionProduct.createMany({
          data: input.product_ids.map((product_id, position) => ({
            collection_id: id,
            product_id,
            store_id: actor.store_id,
            position,
          })),
        });
      }
      const affected = new Set([...before.map((b) => b.product_id), ...input.product_ids]);
      await tx.collection.update({ where: { id }, data: { updated_by: actor.user_id } });
      await this.audit.recordIn(tx, {
        action: "collection.products_changed",
        resource_type: "collection",
        resource_id: id,
        store_id: actor.store_id,
        actor_user_id: actor.user_id,
        metadata: { count: input.product_ids.length },
        request_id: actor.request_id,
      });
      await this.outbox.emit(tx, [
        {
          store_id: actor.store_id,
          event_type: "collection.products_changed",
          resource_type: "collection",
          resource_id: id,
        },
        ...[...affected].map((pid) => ({
          store_id: actor.store_id,
          event_type: "product.updated",
          resource_type: "product",
          resource_id: pid,
        })),
      ]);
    });
    return this.get(actor.store_id, id);
  }

  async remove(id: string, actor: CatalogActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.collection.findFirst({ where: storeScoped(actor.store_id, { id }) });
      if (!c) throw notFound();
      await tx.collection.delete({ where: { id } });
      await this.record(tx, actor, "collection.deleted", id, { title: c.title, handle: c.handle });
    });
  }

  async assertOwned(
    tx: Tx,
    storeId: string,
    ids: string[],
    path = "collection_ids",
  ): Promise<void> {
    if (!ids.length) return;
    const found = await tx.collection.findMany({
      where: { store_id: storeId, id: { in: ids } },
      select: { id: true },
    });
    const ok = new Set(found.map((f) => f.id));
    const bad = ids.map((id, i) => ({ id, i })).filter((x) => !ok.has(x.id));
    if (bad.length) {
      throw AppException.validation(
        bad.map((b) => ({
          path: `${path}.${b.i}`,
          message: "Collection not found.",
          code: "not_found",
        })),
      );
    }
  }

  // ───────────── Helpers ─────────────

  private async assertProducts(tx: Tx, storeId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const found = await tx.product.findMany({
      where: { store_id: storeId, id: { in: ids }, deleted_at: null },
      select: { id: true },
    });
    const ok = new Set(found.map((f) => f.id));
    const bad = ids.map((id, i) => ({ id, i })).filter((x) => !ok.has(x.id));
    if (bad.length) {
      throw AppException.validation(
        bad.map((b) => ({
          path: `product_ids.${b.i}`,
          message: "Product not found.",
          code: "not_found",
        })),
      );
    }
  }

  private async members(storeId: string, id: string): Promise<CollectionProductItem[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        title: string;
        handle: string;
        status: CollectionProductItem["status"];
        position: number;
        price: bigint | null;
        thumb: string | null;
      }[]
    >`
      SELECT p.id, p.title, p.handle, p.status::text AS status, cp.position,
             (SELECT MIN(v.price_minor) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL) AS price,
             (SELECT COALESCE(d.url, a.url) FROM product_media pm JOIN media_assets a ON a.id = pm.media_asset_id
                LEFT JOIN media_derivatives d ON d.media_asset_id = a.id AND d.name = 'thumb'
                WHERE pm.product_id = p.id AND pm.is_primary LIMIT 1) AS thumb
      FROM collection_products cp JOIN products p ON p.id = cp.product_id AND p.deleted_at IS NULL
      WHERE cp.collection_id = ${id}::uuid AND cp.store_id = ${storeId}::uuid
      ORDER BY cp.position ASC, p.title ASC`;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      handle: r.handle,
      status: r.status,
      position: r.position,
      price_minor: r.price === null ? null : Number(r.price),
      thumbnail_url: r.thumb,
    }));
  }

  private async resolveHandle(
    tx: Tx,
    storeId: string,
    explicit: string | undefined,
    source: string,
    exceptId?: string,
  ) {
    const existing = await tx.collection.findMany({
      where: { store_id: storeId, ...(exceptId && { NOT: { id: exceptId } }) },
      select: { handle: true },
    });
    const used = existing.map((e) => e.handle);
    if (explicit) {
      if (used.includes(explicit)) throw handleTaken(explicit);
      return explicit;
    }
    return nextFreeHandle(source, used, "collection");
  }

  private async record(
    tx: Tx,
    actor: CatalogActor,
    action: string,
    id: string,
    metadata: Prisma.InputJsonValue,
  ) {
    await this.audit.recordIn(tx, {
      action,
      resource_type: "collection",
      resource_id: id,
      store_id: actor.store_id,
      actor_user_id: actor.user_id,
      metadata,
      request_id: actor.request_id,
    });
    await this.outbox.emit(tx, {
      store_id: actor.store_id,
      event_type: action,
      resource_type: "collection",
      resource_id: id,
    });
  }

  private toSummary(c: Collection, count: number): CollectionSummary {
    return {
      id: c.id,
      title: c.title,
      handle: c.handle,
      description_html: c.description_html,
      status: c.status,
      sort_order: c.sort_order,
      collection_type: c.collection_type,
      product_count: count,
      seo_title: c.seo_title,
      seo_description: c.seo_description,
      published_handle_locked: c.status === "active",
      created_at: c.created_at.toISOString(),
      updated_at: c.updated_at.toISOString(),
    };
  }
}
