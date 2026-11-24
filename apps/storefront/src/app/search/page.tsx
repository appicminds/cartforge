import type { Metadata } from "next";
import Link from "next/link";
import { parseListParams, ProductListing } from "@/components/product-listing";
import { mainSection, TemplateSections } from "@/components/theme/render";
import { storefront } from "@/lib/api";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = parseListParams(await searchParams);
  return { title: q ? `Search: ${q}` : "Search", robots: { index: false, follow: true } };
}

export default async function Search({ searchParams }: Props) {
  const { q, sort, page } = parseListParams(await searchParams);
  const [store, main] = await Promise.all([storefront.store(), mainSection("search")]);
  const columns = typeof main?.settings.columns === "number" ? main.settings.columns : 4;
  const result = q ? await storefront.products({ q, sort, page }) : null;
  return (
    <TemplateSections
      template="search"
      dynamic={{ "search.terms": q }}
      main={() => (
        <div className="sf-container py-10 md:py-14">
          <h1 className="text-3xl md:text-5xl">Search</h1>
          <form action="/search" method="get" role="search" className="mt-6 flex max-w-xl gap-2">
            <label htmlFor="search-page" className="sr-only">
              Search products
            </label>
            <input
              id="search-page"
              type="search"
              name="q"
              defaultValue={q}
              placeholder="What are you looking for?"
              className="sf-field flex-1"
            />
            <button type="submit" className="sf-button">
              Search
            </button>
          </form>
          <div className="mt-10">
            {result ? (
              <>
                <p className="sr-only" role="status">
                  {result.meta.total} results for {q}
                </p>
                <ProductListing
                  result={result}
                  sort={sort}
                  basePath="/search"
                  extraParams={{ q }}
                  locale={store.locale}
                  columns={columns}
                  empty={
                    <>
                      <p className="text-lg text-ink">No results for “{q}”.</p>
                      <p className="mt-2">
                        Check the spelling, try a more general word, or{" "}
                        <Link href="/products" className="sf-link">
                          browse all products
                        </Link>
                        .
                      </p>
                    </>
                  }
                />
              </>
            ) : (
              <p className="text-muted">Enter a product name to search the store.</p>
            )}
          </div>
        </div>
      )}
    />
  );
}
