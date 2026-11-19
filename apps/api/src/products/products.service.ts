import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, storeScoped, type Product } from "@cartforge/database";
import {
  CATALOG_ERROR_CODES,
  ERROR_CODES,
  type ActorSummary,
  type ListResponse,
  type ProductDetail,
  type ProductListItem,
} from "@cartforge/types";
import {
  slugify,
  type ProductCreate,
  type ProductListQuery,
  type ProductUpdate,
} from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { sanitizeRichText } from "../common/sanitize-html";
import { PrismaService } from "../prisma/prisma.service";
import { toDetail, toListItem } from "./product.mapper";
import { publishErrors } from "./publish-rules";

export interface ActorContext {
  store_id: string;
  user_id: string;
  can_publish: boolean;
  request_id?: string;
  ip?: string;
}

type Tx = Prisma.TransactionClient;

const LIVE = { deleted_at: null } as const;
const MAX_HANDLE_ATTEMPTS = 50;

/** Fields recorded in audit before/after (description is noted, not copied). */
const AUDITED_FIELDS = ["title", "handle", "product_type", "vendor", "status"] as const;

function handleTaken(handle: string) {
  return AppException.conflict(
    "Another product in this store already uses this handle.",
    [{ path: "handle", message: `The handle "${handle}" is already in use.`, code: "taken" }],
    CATALOG_ERROR_CODES.PRODUCT_HANDLE_TAKEN,
  );
}

function isUniqueViolation(err: unknown, index: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = err.meta?.target;
  // Partial indexes surface their index name (or columns) as the target.
  return Array.isArray(target)
    ? target.includes("handle") || target.includes(index)
    : String(target ?? "").includes(index) || String(target ?? "").includes("handle");
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        // Secondary key on id keeps pagination stable when sort values tie.
        orderBy: [{ [q.sort]: q.order }, { id: "asc" }],
        skip: (q.page - 1) * q.page_size,
        take: q.page_size,
        include: {
          variants: { where: LIVE, orderBy: { position: "asc" }, take: 1, select: { sku: true } },
          _count: { select: { variants: { where: LIVE } } },
        },
      }),
    ]);

    return {
      data: rows.map(toListItem),
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
      include: { variants: { where: LIVE, orderBy: { position: "asc" } } },
    });
    // Same 404 for "other store" and "missing" so IDs can't be probed (BE-012).
    if (!product) throw AppException.notFound("Product");
    return toDetail(product, await this.actors([product.created_by, product.updated_by]));
  }

  // ───────────── Commands ─────────────

  async create(input: ProductCreate, ctx: ActorContext): Promise<ProductDetail> {
    if (input.status !== "draft" && !ctx.can_publish) throw this.publishForbidden();

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const handle = input.handle
          ? await this.assertHandleFree(tx, ctx.store_id, input.handle)
          : await this.generateHandle(tx, ctx.store_id, input.title);

        if (input.status === "active") {
          this.assertPublishable({
            title: input.title,
            handle,
            product_type: input.product_type,
            variant_count: 1,
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
            published_at: input.status === "active" ? new Date() : null,
            created_by: ctx.user_id,
            updated_by: ctx.user_id,
            // Every product starts with one default variant (simple products keep exactly one).
            variants: { create: { store_id: ctx.store_id, title: "Default", position: 0 } },
          },
        });

        await this.audit.recordIn(tx, {
          action: "product.created",
          resource_type: "product",
          resource_id: product.id,
          store_id: ctx.store_id,
          actor_user_id: ctx.user_id,
          metadata: { after: this.auditSnapshot(product) },
          request_id: ctx.request_id,
          ip: ctx.ip,
        });
        return product.id;
      });
      return this.get(ctx.store_id, id);
    } catch (err) {
      if (input.handle && isUniqueViolation(err, "products_store_handle_live_key"))
        throw handleTaken(input.handle);
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
          include: { _count: { select: { variants: { where: LIVE } } } },
        });

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
        }

        if (input.product_type !== undefined && input.product_type !== current.product_type) {
          if (input.product_type === "simple" && current._count.variants > 1) {
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

        if (input.status !== undefined && input.status !== current.status) {
          if (!ctx.can_publish) throw this.publishForbidden();
          if (input.status === "active") {
            this.assertPublishable({
              title: (data.title as string | undefined) ?? current.title,
              handle: (data.handle as string | undefined) ?? current.handle,
              product_type:
                (data.product_type as Product["product_type"] | undefined) ?? current.product_type,
              variant_count: current._count.variants,
            });
            if (!current.published_at) data.published_at = new Date();
          }
          set("status", input.status);
        }

        if (!changed.size) return; // No-op: no write, no audit noise.

        data.updated_by = ctx.user_id;
        const updated = await tx.product.update({ where: { id }, data });

        const fields = AUDITED_FIELDS.filter((f) => changed.has(f));
        await this.audit.recordIn(tx, {
          action: changed.has("status") ? `product.status.${updated.status}` : "product.updated",
          resource_type: "product",
          resource_id: id,
          store_id: ctx.store_id,
          actor_user_id: ctx.user_id,
          metadata: {
            changed: [...changed],
            before: Object.fromEntries(fields.map((f) => [f, current[f]])),
            after: Object.fromEntries(fields.map((f) => [f, updated[f]])),
          },
          request_id: ctx.request_id,
          ip: ctx.ip,
        });
      });
    } catch (err) {
      if (input.handle && isUniqueViolation(err, "products_store_handle_live_key"))
        throw handleTaken(input.handle);
      throw err;
    }
    return this.get(ctx.store_id, id);
  }

  /**
   * Soft delete (PRD §8.9). Order item snapshots (Sprint 5+) never reference live
   * product rows for their data, so history stays intact.
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
    });
  }

  // ───────────── Helpers ─────────────

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

  private assertPublishable(candidate: Parameters<typeof publishErrors>[0]): void {
    const errors = publishErrors(candidate);
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
