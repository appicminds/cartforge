import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { gridSettings, parseListParams, ProductListing } from "@/components/product-listing";
import { mainSection, TemplateSections } from "@/components/theme/render";
import { storefront } from "@/lib/api";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { page } = parseListParams(await searchParams);
  return {
    title: page > 1 ? `All products – page ${page}` : "All products",
    alternates: { canonical: page > 1 ? `/products?page=${page}` : "/products" },
  };
}

export default async function AllProducts({ searchParams }: Props) {
  const { sort, page } = parseListParams(await searchParams);
  const g = gridSettings((await mainSection("collection"))?.settings);
  const [store, result] = await Promise.all([
    storefront.store(),
    storefront.products({ sort, page, page_size: g.perPage }),
  ]);
  return (
    <TemplateSections
      template="collection"
      dynamic={{
        "collection.title": "All products",
        "collection.product_count": String(result.meta.total),
      }}
      main={() => (
        <div className="sf-container py-10 md:py-14">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "All products" }]} />
          <h1 className="mb-8 mt-4 text-3xl md:text-5xl">All products</h1>
          <ProductListing
            result={result}
            sort={sort}
            basePath="/products"
            locale={store.locale}
            columns={g.columns}
            showSort={g.showSort}
            empty={<p>No products are available yet. Please check back soon.</p>}
          />
        </div>
      )}
    />
  );
}
