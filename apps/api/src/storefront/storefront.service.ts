import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@cartforge/database";
import {
  ERROR_CODES,
  type ListResponse,
  type StorefrontCategory,
  type StorefrontCategoryDetail,
  type StorefrontCollectionSummary,
  type StorefrontPreviewProduct,
  type StorefrontProduct,
  type StorefrontSitemap,
  type StorefrontStore,
} from "@cartforge/types";
import type { StorefrontListQuery } from "@cartforge/validation";
import { AppException } from "../common/app-exception";
import { mediaUrls } from "../media/media.mapper";
import { PrismaService } from "../prisma/prisma.service";

const PRODUCT_INCLUDE = {
  variants: {
    where: { deleted_at: null },
    orderBy: { position: "asc" },
    include: {
      option_values: { include: { option_value: { include: { option: true } } } },
      inventory: { where: { location: { is_default: true } } },
    },
  },
  options: { orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } } } },
  media: {
    orderBy: [{ is_primary: "desc" }, { position: "asc" }],
    include: { asset: { include: { derivatives: true } } },
  },
  tags: { include: { tag: true } },
  categories: { select: { category_id: true } },
} as const satisfies Prisma.ProductInclude;

type Row = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

interface VisibleCategory {
  id: string;
  parent_id: string | null;
  name: string;
  handle: string;
  depth: number;
  sort_order: number;
  description_html: string;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: Date;
}
type CategoryMap = Map<string, VisibleCategory>;

export class StorefrontRedirect {
  constructor(public readonly to: string) {}
}

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const num = (v: bigint | null) => (v === null ? null : Number(v));

/**
 * Public catalog (PRD §8.11 "active products appear in the storefront catalog;
 * drafts and archived products do not"; §8.10 never expose cost or private data).
 */
@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

  async assertStore(storeId: string | undefined): Promise<StorefrontStore> {
    const ok = storeId && /^[0-9a-f-]{36}$/i.test(storeId);
    const store = ok
      ? await this.prisma.store.findFirst({ where: { id: storeId, status: "active" } })
      : null;
    if (!store) {
      throw new AppException(ERROR_CODES.NOT_FOUND, "Store not found.", HttpStatus.NOT_FOUND);
    }
    return {
      id: store.id,
      name: store.name,
      currency: store.currency,
      locale: store.locale,
      contact_email: store.contact_email,
    };
  }

  async list(
    storeId: string,
    currency: string,
    q: StorefrontListQuery,
  ): Promise<Omit<ListResponse<StorefrontProduct>, "request_id">> {
    const joins: Prisma.Sql[] = [];
    const where: Prisma.Sql[] = [
      Prisma.sql`p.store_id = ${storeId}::uuid`,
      Prisma.sql`p.status = 'active'`,
      Prisma.sql`p.deleted_at IS NULL`,
    ];
    let featured = Prisma.sql`p.published_at DESC NULLS LAST`;

    if (q.collection) {
      const c = await this.prisma.collection.findFirst({
        where: { store_id: storeId, handle: q.collection, status: "active" },
      });
      if (!c) throw AppException.notFound("Collection");
      joins.push(
        Prisma.sql`JOIN collection_products cp ON cp.product_id = p.id AND cp.collection_id = ${c.id}::uuid`,
      );
      featured =
        c.sort_order === "manual"
          ? Prisma.sql`cp.position ASC`
          : this.sortSql(
              c.sort_order === "created_desc"
                ? "newest"
                : c.sort_order === "created_asc"
                  ? "oldest"
                  : c.sort_order,
            );
    }
    if (q.category) {
      const ids = await this.categoryAndDescendants(storeId, q.category);
      where.push(
        Prisma.sql`EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))}))`,
      );
    }
    if (q.q) {
      const like = `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      where.push(Prisma.sql`(p.title ILIKE ${like} OR p.vendor ILIKE ${like})`);
    }
    const order = q.sort === "featured" ? featured : this.sortSql(q.sort);
    // Prisma.join throws on an empty list, so only join when there is something to join.
    const joinSql = joins.length ? Prisma.join(joins, " ") : Prisma.empty;
    const from = Prisma.sql`FROM products p ${joinSql} WHERE ${Prisma.join(where, " AND ")}`;

    const [countRow] = await this.prisma.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*)::bigint AS n ${from}`;
    const idRows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id ${from} ORDER BY ${order}, p.id ASC LIMIT ${q.page_size} OFFSET ${(q.page - 1) * q.page_size}`;
    const ids = idRows.map((r) => r.id);
    const rows = ids.length
      ? await this.prisma.product.findMany({ where: { id: { in: ids } }, include: PRODUCT_INCLUDE })
      : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const total = Number(countRow?.n ?? 0);
    const cats = rows.length ? await this.visibleCategories(storeId) : new Map();
    return {
      data: ids.map((id) => this.toPublic(byId.get(id)!, currency, cats)),
      meta: {
        page: q.page,
        page_size: q.page_size,
        total,
        total_pages: Math.ceil(total / q.page_size),
      },
    };
  }

  /** Product by handle; a renamed published product resolves via its redirect. */
  async byHandle(storeId: string, currency: string, handle: string): Promise<StorefrontProduct> {
    const p = await this.prisma.product.findFirst({
      where: { store_id: storeId, handle, status: "active", deleted_at: null },
      include: PRODUCT_INCLUDE,
    });
    if (p) return this.toPublic(p, currency, await this.visibleCategories(storeId));
    const redirect = await this.prisma.urlRedirect.findUnique({
      where: { store_id_path_from: { store_id: storeId, path_from: `/products/${handle}` } },
    });
    if (redirect) throw new StorefrontRedirect(redirect.path_to);
    throw AppException.notFound("Product");
  }

  async collection(storeId: string, handle: string) {
    const c = await this.prisma.collection.findFirst({
      where: { store_id: storeId, handle, status: "active" },
    });
    if (!c) {
      const redirect = await this.prisma.urlRedirect.findUnique({
        where: { store_id_path_from: { store_id: storeId, path_from: `/collections/${handle}` } },
      });
      if (redirect) throw new StorefrontRedirect(redirect.path_to);
      throw AppException.notFound("Collection");
    }
    return {
      id: c.id,
      handle: c.handle,
      title: c.title,
      description_html: c.description_html,
      seo: {
        title: c.seo_title ?? c.title,
        description: c.seo_description ?? stripHtml(c.description_html).slice(0, 160),
      },
    };
  }

  /** Any non-deleted product, for signed previews (PRD §11.1 "explicit preview capability"). */
  async preview(storeId: string, currency: string, id: string): Promise<StorefrontPreviewProduct> {
    const p = await this.prisma.product.findFirst({
      where: { store_id: storeId, id, deleted_at: null },
      include: PRODUCT_INCLUDE,
    });
    if (!p) throw AppException.notFound("Product");
    return {
      ...this.toPublic(p, currency, await this.visibleCategories(storeId)),
      status: p.status,
    };
  }

  /** Active categories whose ancestors are all active, in tree order. */
  async categories(storeId: string): Promise<StorefrontCategory[]> {
    const cats = await this.visibleCategories(storeId);
    const counts = await this.subtreeCounts(storeId);
    return this.treeOrder(cats).map((c) => ({
      id: c.id,
      parent_id: c.parent_id,
      name: c.name,
      handle: c.handle,
      depth: c.depth,
      product_count: counts.get(c.id) ?? 0,
    }));
  }

  async category(storeId: string, handle: string): Promise<StorefrontCategoryDetail> {
    const cats = await this.visibleCategories(storeId);
    const c = [...cats.values()].find((x) => x.handle === handle);
    if (!c) throw AppException.notFound("Category");
    const counts = await this.subtreeCounts(storeId);
    const ancestors: { name: string; handle: string }[] = [];
    for (let p = c.parent_id ? cats.get(c.parent_id) : undefined; p; ) {
      ancestors.unshift({ name: p.name, handle: p.handle });
      p = p.parent_id ? cats.get(p.parent_id) : undefined;
    }
    const children = [...cats.values()]
      .filter((x) => x.parent_id === c.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((x) => ({ name: x.name, handle: x.handle }));
    return {
      id: c.id,
      parent_id: c.parent_id,
      name: c.name,
      handle: c.handle,
      depth: c.depth,
      product_count: counts.get(c.id) ?? 0,
      description_html: c.description_html,
      ancestors,
      children,
      seo: {
        title: c.seo_title ?? c.name,
        description: c.seo_description ?? stripHtml(c.description_html).slice(0, 160),
      },
    };
  }

  async collections(storeId: string): Promise<StorefrontCollectionSummary[]> {
    const rows = await this.prisma.collection.findMany({
      where: { store_id: storeId, status: "active" },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      take: 200,
      include: {
        _count: {
          select: { products: { where: { product: { status: "active", deleted_at: null } } } },
        },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      handle: c.handle,
      title: c.title,
      description_html: c.description_html,
      product_count: c._count.products,
    }));
  }

  /** Everything indexable, newest first; capped at the 50k-URL sitemap limit. */
  async sitemap(storeId: string): Promise<StorefrontSitemap> {
    const [products, collections, cats] = await Promise.all([
      this.prisma.product.findMany({
        where: { store_id: storeId, status: "active", deleted_at: null },
        select: { handle: true, updated_at: true },
        orderBy: { updated_at: "desc" },
        take: 45_000,
      }),
      this.prisma.collection.findMany({
        where: { store_id: storeId, status: "active" },
        select: { handle: true, updated_at: true },
        take: 2_500,
      }),
      this.visibleCategories(storeId),
    ]);
    const iso = (r: { handle: string; updated_at: Date }) => ({
      handle: r.handle,
      updated_at: r.updated_at.toISOString(),
    });
    return {
      products: products.map(iso),
      collections: collections.map(iso),
      categories: [...cats.values()].map(iso),
    };
  }

  // ───────────── Helpers ─────────────

  private async visibleCategories(storeId: string): Promise<CategoryMap> {
    const all = await this.prisma.category.findMany({
      where: { store_id: storeId },
      select: {
        id: true,
        parent_id: true,
        name: true,
        handle: true,
        status: true,
        sort_order: true,
        description_html: true,
        seo_title: true,
        seo_description: true,
        updated_at: true,
      },
    });
    const byId = new Map(all.map((c) => [c.id, c]));
    const out: CategoryMap = new Map();
    for (const c of all) {
      let depth = 0;
      let ok = c.status === "active";
      for (let p = c.parent_id; ok && p; depth++) {
        const parent = byId.get(p);
        ok = !!parent && parent.status === "active" && depth < 10;
        p = parent?.parent_id ?? null;
      }
      if (ok) {
        const { status: _status, ...rest } = c;
        out.set(c.id, { ...rest, depth });
      }
    }
    return out;
  }

  private treeOrder(cats: CategoryMap): VisibleCategory[] {
    const kids = new Map<string | null, VisibleCategory[]>();
    for (const c of cats.values()) {
      const list = kids.get(c.parent_id) ?? [];
      list.push(c);
      kids.set(c.parent_id, list);
    }
    const out: VisibleCategory[] = [];
    const walk = (parent: string | null) => {
      const list = (kids.get(parent) ?? []).sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
      for (const c of list) {
        out.push(c);
        walk(c.id);
      }
    };
    walk(null);
    return out;
  }

  /** Distinct active products per category subtree (max depth 3, so the CTE stays tiny). */
  private async subtreeCounts(storeId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ root: string; n: bigint }[]>`
      WITH RECURSIVE tree AS (
        SELECT id AS root, id FROM categories WHERE store_id = ${storeId}::uuid AND status = 'active'
        UNION ALL
        SELECT t.root, c.id FROM categories c JOIN tree t ON c.parent_id = t.id WHERE c.status = 'active'
      )
      SELECT t.root, count(DISTINCT pc.product_id)::bigint AS n
      FROM tree t
      JOIN product_categories pc ON pc.category_id = t.id
      JOIN products p ON p.id = pc.product_id AND p.status = 'active' AND p.deleted_at IS NULL
      GROUP BY t.root`;
    return new Map(rows.map((r) => [r.root, Number(r.n)]));
  }

  private sortSql(sort: string): Prisma.Sql {
    const minPrice = Prisma.sql`(SELECT MIN(v.price_minor) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL)`;
    switch (sort) {
      case "title_asc":
        return Prisma.sql`p.title ASC`;
      case "title_desc":
        return Prisma.sql`p.title DESC`;
      case "price_asc":
        return Prisma.sql`${minPrice} ASC NULLS LAST`;
      case "price_desc":
        return Prisma.sql`${minPrice} DESC NULLS LAST`;
      case "oldest":
        return Prisma.sql`p.published_at ASC NULLS LAST`;
      default:
        return Prisma.sql`p.published_at DESC NULLS LAST`;
    }
  }

  private async categoryAndDescendants(storeId: string, handle: string): Promise<string[]> {
    const all = await this.prisma.category.findMany({
      where: { store_id: storeId, status: "active" },
      select: { id: true, parent_id: true, handle: true },
    });
    const root = all.find((c) => c.handle === handle);
    if (!root) throw AppException.notFound("Category");
    const ids = [root.id];
    for (let i = 0; i < ids.length; i++)
      for (const c of all) if (c.parent_id === ids[i]) ids.push(c.id);
    return ids;
  }

  private toPublic(p: Row, currency: string, cats: CategoryMap): StorefrontProduct {
    const images = p.media.map((m) => ({
      ...mediaUrls(m.asset),
      alt: m.alt_text ?? m.asset.alt_text,
      width: m.asset.width,
      height: m.asset.height,
    }));
    const imageIndex = new Map(p.media.map((m, i) => [m.media_asset_id, i]));
    const variants = p.variants.map((v) => {
      const level = v.inventory[0];
      const available = (level?.on_hand ?? 0) - (level?.reserved ?? 0);
      return {
        id: v.id,
        title: v.title,
        options: [...v.option_values]
          .sort((a, b) => a.option_value.option.position - b.option_value.option.position)
          .map((ov) => ({ option: ov.option_value.option.name, value: ov.option_value.value })),
        price_minor: num(v.price_minor),
        compare_at_minor: num(v.compare_at_minor),
        available: !v.inventory_tracking || v.continue_selling || available > 0,
        image_index: v.media_asset_id ? (imageIndex.get(v.media_asset_id) ?? null) : null,
      };
    });
    const prices = variants.map((v) => v.price_minor).filter((x): x is number => x !== null);
    const compares = variants.map((v) => v.compare_at_minor).filter((x): x is number => x !== null);
    return {
      id: p.id,
      handle: p.handle,
      title: p.title,
      description_html: p.description_html,
      vendor: p.vendor,
      currency,
      price_min_minor: prices.length ? Math.min(...prices) : null,
      price_max_minor: prices.length ? Math.max(...prices) : null,
      compare_at_min_minor: compares.length ? Math.min(...compares) : null,
      available: variants.some((v) => v.available),
      images: images.map(({ url, thumb_url, medium_url, large_url, alt, width, height }) => ({
        url,
        thumb_url,
        medium_url,
        large_url,
        alt,
        width,
        height,
      })),
      options: p.options.map((o) => ({ name: o.name, values: o.values.map((v) => v.value) })),
      variants,
      tags: p.tags.map((t) => t.tag.name).sort(),
      categories: p.categories
        .map((pc) => cats.get(pc.category_id))
        .filter((c): c is VisibleCategory => !!c)
        .sort((a, b) => b.depth - a.depth || a.name.localeCompare(b.name))
        .map((c) => ({ handle: c.handle, name: c.name })),
      seo: {
        title: p.seo_title ?? p.title,
        description: p.seo_description ?? stripHtml(p.description_html).slice(0, 160),
      },
      published_at: p.published_at?.toISOString() ?? null,
      updated_at: p.updated_at.toISOString(),
    };
  }
}
