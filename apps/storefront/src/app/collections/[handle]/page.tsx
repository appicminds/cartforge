import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { gridSettings, parseListParams, ProductListing } from "@/components/product-listing";
import { mainSection, TemplateSections } from "@/components/theme/render";
import { lastSegment, PRODUCT_SORTS, storefront } from "@/lib/api";

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function load(handle: string) {
  const r = await storefront.collection(handle);
  if (r.kind === "moved") permanentRedirect(`/collections/${lastSegment(r.to)}`);
  if (r.kind === "not_found") notFound();
  return r.data;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { handle } = await params;
  const { page } = parseListParams(await searchParams);
  const c = await load(handle);
  const path = `/collections/${c.handle}`;
  return {
    title: c.seo.title,
    description: c.seo.description || undefined,
    alternates: { canonical: page > 1 ? `${path}?page=${page}` : path },
    openGraph: { title: c.seo.title, description: c.seo.description || undefined, url: path },
  };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { sort, page } = parseListParams(await searchParams);
  const [c, store] = await Promise.all([load(handle), storefront.store()]);
  const main = await mainSection("collection", c.template_suffix);
  const g = gridSettings(main?.settings);
  const result = await storefront.products({
    collection: c.handle,
    sort,
    page,
    page_size: g.perPage,
  });
  return (
    <TemplateSections
      template="collection"
      suffix={c.template_suffix}
      dynamic={{
        "collection.title": c.title,
        "collection.product_count": String(result.meta.total),
      }}
      main={() => (
        <div className="sf-container py-10 md:py-14">
          <Breadcrumbs
            items={[
              { name: "Home", href: "/" },
              { name: "Collections", href: "/collections" },
              { name: c.title },
            ]}
          />
          <h1 className="mt-4 text-3xl md:text-5xl">{c.title}</h1>
          {g.showDescription && c.description_html && (
            <div
              className="sf-prose mt-4 max-w-2xl text-muted"
              // Sanitized by the API against an allow-list when saved.
              dangerouslySetInnerHTML={{ __html: c.description_html }}
            />
          )}
          <div className="mt-10">
            <ProductListing
              result={result}
              sort={sort}
              basePath={`/collections/${c.handle}`}
              locale={store.locale}
              sorts={PRODUCT_SORTS}
              columns={g.columns}
              showSort={g.showSort}
              empty={<p>This collection is empty right now.</p>}
            />
          </div>
        </div>
      )}
    />
  );
}
