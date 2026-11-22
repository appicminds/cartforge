import type { ListResponse, StorefrontProduct } from "@cartforge/types";
import { PRODUCT_SORTS, type ProductSort } from "@/lib/api";
import { Pagination } from "./pagination";
import { ProductGrid } from "./product-card";
import { SortForm } from "./sort-form";

/** Count + sort + grid + pagination, shared by all-products, collection, category and search. */
export function ProductListing({
  result,
  sort,
  basePath,
  extraParams = {},
  locale,
  empty,
  sorts = PRODUCT_SORTS,
  columns = 4,
  showSort = true,
}: {
  result: ListResponse<StorefrontProduct>;
  sort: ProductSort;
  basePath: string;
  extraParams?: Record<string, string>;
  locale?: string;
  empty: React.ReactNode;
  sorts?: typeof PRODUCT_SORTS;
  columns?: number;
  showSort?: boolean;
}) {
  const { total, page, total_pages } = result.meta;
  const href = (p: number) => {
    const qs = new URLSearchParams(extraParams);
    if (sort !== "featured") qs.set("sort", sort);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  if (!total) return <div className="py-16 text-center text-muted">{empty}</div>;
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <p className="text-sm text-muted" aria-live="polite">
          {total} {total === 1 ? "product" : "products"}
        </p>
        {showSort && <SortForm value={sort} options={sorts} hidden={extraParams} />}
      </div>
      <ProductGrid products={result.data} locale={locale} eager={4} columns={columns} />
      <Pagination page={page} totalPages={total_pages} href={href} />
    </>
  );
}

export function parseListParams(sp: Record<string, string | string[] | undefined>) {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const sort = PRODUCT_SORTS.some((s) => s.value === one("sort"))
    ? (one("sort") as ProductSort)
    : "featured";
  const page = Math.min(Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1), 500);
  return { sort, page, q: one("q")?.trim().slice(0, 100) ?? "" };
}

/** The theme's "Product grid" settings for listing pages. */
export function gridSettings(s: Record<string, unknown> | undefined) {
  return {
    perPage: typeof s?.per_page === "number" ? s.per_page : 24,
    columns: typeof s?.columns === "number" ? s.columns : 4,
    showSort: s?.show_sort !== false,
    showDescription: s?.show_description !== false,
  };
}
