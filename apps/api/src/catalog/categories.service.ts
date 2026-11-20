import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, storeScoped, type Category } from "@cartforge/database";
import { CATALOG_ERROR_CODES, type CategorySummary } from "@cartforge/types";
import {
  MAX_CATEGORY_DEPTH,
  type CategoryCreate,
  type CategoryDelete,
  type CategoryReorder,
  type CategoryUpdate,
} from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { OutboxService } from "../common/outbox.service";
import { sanitizeRichText } from "../common/sanitize-html";
import { PrismaService } from "../prisma/prisma.service";
import { childrenIndex, depthOf, heightOf, isSelfOrDescendant } from "./category-tree";
import { nextFreeHandle } from "./handles";

type Tx = Prisma.TransactionClient;

export interface CatalogActor {
  store_id: string;
  user_id: string;
  request_id?: string;
}

const notFound = () =>
  new AppException(
    CATALOG_ERROR_CODES.CATEGORY_NOT_FOUND,
    "Category not found.",
    HttpStatus.NOT_FOUND,
  );
const handleTaken = (handle: string) =>
  AppException.conflict(
    "Another category already uses this handle.",
    [{ path: "handle", message: `The handle "${handle}" is already in use.`, code: "taken" }],
    CATALOG_ERROR_CODES.CATEGORY_HANDLE_TAKEN,
  );

/** Hierarchical categories (PRD §8.6): depth limit, no cycles, safe deletion. */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** Whole tree in display order (depth-first, by sort_order then name). */
  async list(storeId: string): Promise<CategorySummary[]> {
    const rows = await this.prisma.category.findMany({ where: { store_id: storeId } });
    const counts = await this.prisma.$queryRaw<{ category_id: string; n: bigint }[]>`
      SELECT pc.category_id, count(*)::bigint AS n FROM product_categories pc
      JOIN products p ON p.id = pc.product_id AND p.deleted_at IS NULL
      WHERE pc.store_id = ${storeId}::uuid GROUP BY pc.category_id`;
    const countBy = new Map(counts.map((c) => [c.category_id, Number(c.n)]));
    const kids = childrenIndex(rows);
    const out: CategorySummary[] = [];
    const visit = (parent: string | null, depth: number, prefix: string[]) => {
      const list = [...(kids.get(parent) ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
      for (const c of list) {
        const path = [...prefix, c.name];
        out.push(
          this.toSummary(
            c,
            depth,
            path.join(" › "),
            countBy.get(c.id) ?? 0,
            kids.get(c.id)?.length ?? 0,
          ),
        );
        visit(c.id, depth + 1, path);
      }
    };
    visit(null, 0, []);
    return out;
  }

  async get(storeId: string, id: string): Promise<CategorySummary> {
    const found = (await this.list(storeId)).find((c) => c.id === id);
    if (!found) throw notFound();
    return found;
  }

  async create(input: CategoryCreate, actor: CatalogActor): Promise<CategorySummary> {
    const id = await this.prisma.$transaction(async (tx) => {
      const all = await tx.category.findMany({ where: { store_id: actor.store_id } });
      const parentId = input.parent_id ?? null;
      this.assertPlacement(all, null, parentId);
      const handle = await this.resolveHandle(tx, actor.store_id, input.handle, input.name);
      const siblings = all.filter((c) => c.parent_id === parentId);
      const created = await tx.category.create({
        data: {
          store_id: actor.store_id,
          parent_id: parentId,
          name: input.name,
          handle,
          description_html: sanitizeRichText(input.description_html ?? ""),
          status: input.status ?? "active",
          seo_title: input.seo_title ?? null,
          seo_description: input.seo_description ?? null,
          sort_order: siblings.length ? Math.max(...siblings.map((s) => s.sort_order)) + 1 : 0,
        },
      });
      await this.record(tx, actor, "category.created", created.id, {
        name: created.name,
        parent_id: parentId,
      });
      return created.id;
    });
    return this.get(actor.store_id, id);
  }

  async update(id: string, input: CategoryUpdate, actor: CatalogActor): Promise<CategorySummary> {
    await this.prisma.$transaction(async (tx) => {
      const all = await tx.category.findMany({ where: { store_id: actor.store_id } });
      const current = all.find((c) => c.id === id);
      if (!current) throw notFound();
      const data: Prisma.CategoryUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.handle !== undefined && input.handle !== current.handle) {
        data.handle = await this.resolveHandle(tx, actor.store_id, input.handle, input.handle, id);
      }
      if (input.parent_id !== undefined && input.parent_id !== current.parent_id) {
        this.assertPlacement(all, id, input.parent_id);
        data.parent = input.parent_id ? { connect: { id: input.parent_id } } : { disconnect: true };
        const siblings = all.filter((c) => c.parent_id === input.parent_id);
        data.sort_order = siblings.length ? Math.max(...siblings.map((s) => s.sort_order)) + 1 : 0;
      }
      if (input.description_html !== undefined)
        data.description_html = sanitizeRichText(input.description_html);
      if (input.status !== undefined) data.status = input.status;
      if (input.seo_title !== undefined) data.seo_title = input.seo_title;
      if (input.seo_description !== undefined) data.seo_description = input.seo_description;
      if (!Object.keys(data).length) return;
      await tx.category.update({ where: { id }, data });
      await this.record(tx, actor, "category.updated", id, { changed: Object.keys(data) });
    });
    return this.get(actor.store_id, id);
  }

  /** Reorders siblings; `ids` must be exactly the children of `parent_id`. */
  async reorder(input: CategoryReorder, actor: CatalogActor): Promise<CategorySummary[]> {
    await this.prisma.$transaction(async (tx) => {
      const siblings = await tx.category.findMany({
        where: { store_id: actor.store_id, parent_id: input.parent_id },
      });
      const have = new Set(siblings.map((s) => s.id));
      if (siblings.length !== input.ids.length || !input.ids.every((i) => have.has(i))) {
        throw AppException.validation([
          {
            path: "ids",
            message: "List every category under this parent exactly once.",
            code: "mismatch",
          },
        ]);
      }
      for (const [i, cid] of input.ids.entries())
        await tx.category.update({ where: { id: cid }, data: { sort_order: i } });
      await this.record(tx, actor, "category.reordered", input.parent_id ?? input.ids[0]!, {
        parent_id: input.parent_id,
        ids: input.ids,
      });
    });
    return this.list(actor.store_id);
  }

  /**
   * Deleting requires an explicit decision for assigned products (PRD §8.6):
   * reassign_to another category, or unassign. Categories with children must be
   * emptied first so nothing is orphaned silently.
   */
  async remove(id: string, input: CategoryDelete, actor: CatalogActor): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const cat = await tx.category.findFirst({
        where: storeScoped(actor.store_id, { id }),
        include: { _count: { select: { children: true } } },
      });
      if (!cat) throw notFound();
      if (cat._count.children) {
        throw new AppException(
          CATALOG_ERROR_CODES.CATEGORY_HAS_CHILDREN,
          "Move or delete this category's subcategories first.",
          HttpStatus.CONFLICT,
        );
      }
      const productIds = (
        await tx.productCategory.findMany({
          where: { category_id: id, product: { deleted_at: null } },
          select: { product_id: true },
        })
      ).map((p) => p.product_id);

      if (productIds.length && !input.reassign_to && !input.unassign) {
        throw new AppException(
          CATALOG_ERROR_CODES.CATEGORY_HAS_PRODUCTS,
          `${productIds.length} product${productIds.length === 1 ? " is" : "s are"} in this category. Move them to another category or remove them from it.`,
          HttpStatus.CONFLICT,
          [{ path: "products", message: String(productIds.length), code: "has_products" }],
        );
      }
      if (input.reassign_to) {
        if (input.reassign_to === id)
          throw AppException.validation([
            { path: "reassign_to", message: "Choose a different category.", code: "same" },
          ]);
        const target = await tx.category.findFirst({
          where: storeScoped(actor.store_id, { id: input.reassign_to }),
        });
        if (!target)
          throw AppException.validation([
            { path: "reassign_to", message: "Category not found.", code: "not_found" },
          ]);
        await tx.productCategory.createMany({
          data: productIds.map((product_id) => ({
            product_id,
            category_id: target.id,
            store_id: actor.store_id,
          })),
          skipDuplicates: true,
        });
      }
      await tx.category.delete({ where: { id } });
      await this.record(tx, actor, "category.deleted", id, {
        name: cat.name,
        products: productIds.length,
        reassigned_to: input.reassign_to ?? null,
      });
      if (productIds.length) {
        await this.outbox.emit(
          tx,
          productIds.map((pid) => ({
            store_id: actor.store_id,
            event_type: "product.updated",
            resource_type: "product",
            resource_id: pid,
          })),
        );
      }
    });
  }

  /** Validates that every id is a category of this store. */
  async assertOwned(tx: Tx, storeId: string, ids: string[], path = "category_ids"): Promise<void> {
    if (!ids.length) return;
    const found = await tx.category.findMany({
      where: { store_id: storeId, id: { in: ids } },
      select: { id: true },
    });
    const ok = new Set(found.map((f) => f.id));
    const bad = ids.map((id, i) => ({ id, i })).filter((x) => !ok.has(x.id));
    if (bad.length) {
      throw AppException.validation(
        bad.map((b) => ({
          path: `${path}.${b.i}`,
          message: "Category not found.",
          code: "not_found",
        })),
      );
    }
  }

  // ───────────── Helpers ─────────────

  private assertPlacement(all: Category[], id: string | null, parentId: string | null): void {
    if (!parentId) return;
    const byId = new Map(all.map((c) => [c.id, c]));
    if (!byId.has(parentId)) {
      throw AppException.validation([
        { path: "parent_id", message: "Parent category not found.", code: "not_found" },
      ]);
    }
    if (id && isSelfOrDescendant(id, parentId, byId)) {
      throw new AppException(
        CATALOG_ERROR_CODES.CATEGORY_CYCLE,
        "A category can't be placed inside itself or one of its subcategories.",
        HttpStatus.UNPROCESSABLE_ENTITY,
        [
          {
            path: "parent_id",
            message: "Choose a parent outside this category's branch.",
            code: "cycle",
          },
        ],
      );
    }
    const height = id ? heightOf(id, childrenIndex(all)) : 0;
    if (depthOf(parentId, byId) + 1 + height > MAX_CATEGORY_DEPTH - 1) {
      throw new AppException(
        CATALOG_ERROR_CODES.CATEGORY_DEPTH_EXCEEDED,
        `Categories can be nested up to ${MAX_CATEGORY_DEPTH} levels.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        [
          {
            path: "parent_id",
            message: `Categories can be nested up to ${MAX_CATEGORY_DEPTH} levels.`,
            code: "too_deep",
          },
        ],
      );
    }
  }

  private async resolveHandle(
    tx: Tx,
    storeId: string,
    explicit: string | undefined,
    source: string,
    exceptId?: string,
  ) {
    const existing = await tx.category.findMany({
      where: { store_id: storeId, ...(exceptId && { NOT: { id: exceptId } }) },
      select: { handle: true },
    });
    const used = existing.map((e) => e.handle);
    if (explicit) {
      if (used.includes(explicit)) throw handleTaken(explicit);
      return explicit;
    }
    return nextFreeHandle(source, used, "category");
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
      resource_type: "category",
      resource_id: id,
      store_id: actor.store_id,
      actor_user_id: actor.user_id,
      metadata,
      request_id: actor.request_id,
    });
    await this.outbox.emit(tx, {
      store_id: actor.store_id,
      event_type: action,
      resource_type: "category",
      resource_id: id,
    });
  }

  private toSummary(
    c: Category,
    depth: number,
    path: string,
    products: number,
    children: number,
  ): CategorySummary {
    return {
      id: c.id,
      parent_id: c.parent_id,
      name: c.name,
      handle: c.handle,
      description_html: c.description_html,
      status: c.status,
      sort_order: c.sort_order,
      depth,
      path,
      product_count: products,
      child_count: children,
      seo_title: c.seo_title,
      seo_description: c.seo_description,
      updated_at: c.updated_at.toISOString(),
    };
  }
}
