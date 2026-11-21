import "server-only";
import type {
  ListResponse,
  StorefrontCategory,
  StorefrontCategoryDetail,
  StorefrontCollectionSummary,
  StorefrontPreviewProduct,
  StorefrontProduct,
  StorefrontMarket,
  StorefrontSitemap,
  StorefrontStore,
} from "@cartforge/types";
import { marketForCountry } from "@cartforge/checkout-engine/markets";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { config, site } from "./config";

/** Every catalog read is filed under this tag; the API purges it on each write. */
export const CATALOG_TAG = "catalog";
/** Backstop when a purge is missed (e.g. the storefront was unreachable). */
const REVALIDATE_SECONDS = 300;

export class StorefrontApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Result<T> = { kind: "ok"; data: T } | { kind: "not_found" } | { kind: "moved"; to: string };

/** Cache tags: the store's own (purged on its writes) plus the global one. */
const tagsFor = (storeId: string) => [CATALOG_TAG, `${CATALOG_TAG}:${storeId}`];

async function get<T>(path: string, opts: { fresh?: boolean } = {}): Promise<Result<T>> {
  const { storeId } = await site();
  const res = await fetch(`${config.apiUrl}/api/v1/storefront${path}`, {
    headers: { "X-Store-Id": storeId, Accept: "application/json" },
    redirect: "manual",
    ...(opts.fresh
      ? { cache: "no-store" as const }
      : {
          cache: "force-cache" as const,
          next: { tags: tagsFor(storeId), revalidate: REVALIDATE_SECONDS },
        }),
  });
  if (res.status === 404) return { kind: "not_found" };
  if (res.status === 301 || res.status === 308) {
    const body = (await res.json().catch(() => null)) as { redirect_to?: string } | null;
    if (body?.redirect_to) return { kind: "moved", to: body.redirect_to };
  }
  if (!res.ok) {
    throw new StorefrontApiError(res.status, `Storefront API ${path} answered ${res.status}`);
  }
  return { kind: "ok", data: ((await res.json()) as { data: T }).data };
}

async function list<T>(path: string): Promise<ListResponse<T>> {
  const { storeId } = await site();
  const res = await fetch(`${config.apiUrl}/api/v1/storefront${path}`, {
    headers: { "X-Store-Id": storeId, Accept: "application/json" },
    cache: "force-cache",
    next: { tags: tagsFor(storeId), revalidate: REVALIDATE_SECONDS },
  });
  if (res.status === 404) return { data: [], meta: emptyMeta(), request_id: "" };
  if (!res.ok)
    throw new StorefrontApiError(res.status, `Storefront API ${path} answered ${res.status}`);
  return (await res.json()) as ListResponse<T>;
}

const emptyMeta = () => ({ page: 1, page_size: 24, total: 0, total_pages: 0 });

function must<T>(r: Result<T>, what: string): T {
  if (r.kind !== "ok") throw new StorefrontApiError(404, `${what} unavailable`);
  return r.data;
}

export type ProductSort = "featured" | "newest" | "title_asc" | "price_asc" | "price_desc";
export const PRODUCT_SORTS: { value: ProductSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price, low to high" },
  { value: "price_desc", label: "Price, high to low" },
  { value: "title_asc", label: "Alphabetical" },
];

export interface ProductQuery {
  q?: string;
  collection?: string;
  category?: string;
  sort?: ProductSort;
  page?: number;
  page_size?: number;
}

/** The shopper's chosen market (set by the country selector). */
export const MARKET_COOKIE = "cf_market";

/**
 * The shopper's market: their choice, else the one for the country their request
 * comes from (Vercel / Cloudflare geo header), else the store's primary market.
 */
export const currentMarket = cache(async (): Promise<StorefrontMarket> => {
  const list = await storefront.markets();
  if (!list.length) {
    const store = await storefront.store();
    return {
      id: "primary",
      name: store.name,
      currency: store.currency,
      countries: [],
      is_primary: true,
    };
  }
  const chosen = (await cookies()).get(MARKET_COOKIE)?.value;
  const hit = list.find((m) => m.id === chosen);
  if (hit) return hit;
  const h = await headers();
  const country = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry");
  return (
    marketForCountry(
      list.map((m) => ({ ...m, active: true })),
      country,
    ) ?? list[0]!
  );
});

/** `market=<id>` for catalog reads in another market (part of the URL, so caches stay apart). */
async function marketQuery(): Promise<string> {
  const m = await currentMarket();
  return m.is_primary ? "" : m.id;
}

export const storefront = {
  /** Cached per request so layout, metadata and pages share one call. */
  store: cache(async () => must(await get<StorefrontStore>("/store"), "Store")),
  categories: cache(async () => must(await get<StorefrontCategory[]>("/categories"), "Categories")),
  collections: cache(async () =>
    must(await get<StorefrontCollectionSummary[]>("/collections"), "Collections"),
  ),
  markets: cache(async () => {
    const r = await get<StorefrontMarket[]>("/markets");
    return r.kind === "ok" && r.data.length ? r.data : [];
  }),
  products: async (q: ProductQuery) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") qs.set(k, String(v));
    const market = await marketQuery();
    if (market) qs.set("market", market);
    return list<StorefrontProduct>(`/products?${qs}`);
  },
  product: cache(async (handle: string) => {
    const market = await marketQuery();
    return get<StorefrontProduct>(
      `/products/${encodeURIComponent(handle)}${market ? `?market=${market}` : ""}`,
    );
  }),
  collection: cache((handle: string) =>
    get<{
      id: string;
      handle: string;
      title: string;
      description_html: string;
      seo: { title: string; description: string };
    }>(`/collections/${encodeURIComponent(handle)}`),
  ),
  category: cache((handle: string) =>
    get<StorefrontCategoryDetail>(`/categories/${encodeURIComponent(handle)}`),
  ),
  sitemap: async () => must(await get<StorefrontSitemap>("/sitemap"), "Sitemap"),
  /** Never cached: drafts must not leak into the shared cache. */
  preview: (id: string, token: string) =>
    get<StorefrontPreviewProduct>(
      `/preview/products/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
      { fresh: true },
    ),
};

/** "/products/new-handle" → "new-handle" */
export const lastSegment = (path: string) => path.split("/").filter(Boolean).pop() ?? "";
