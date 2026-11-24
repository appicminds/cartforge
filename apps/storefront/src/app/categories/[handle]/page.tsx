import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { gridSettings, parseListParams, ProductListing } from "@/components/product-listing";
import { mainSection, TemplateSections } from "@/components/theme/render";
import { storefront } from "@/lib/api";
import { site } from "@/lib/config";
import { breadcrumbJsonLd, jsonLd } from "@/lib/seo";

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function load(handle: string) {
  const r = await storefront.category(handle);
  if (r.kind !== "ok") notFound();
  return r.data;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { handle } = await params;
  const { page } = parseListParams(await searchParams);
  const c = await load(handle);
  const path = `/categories/${c.handle}`;
  return {
    title: c.seo.title,
    description: c.seo.description || undefined,
    alternates: { canonical: page > 1 ? `${path}?page=${page}` : path },
    openGraph: { title: c.seo.title, description: c.seo.description || undefined, url: path },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { handle } = await params;
  const { sort, page } = parseListParams(await searchParams);
  const [c, store, { siteUrl }, main] = await Promise.all([
    load(handle),
    storefront.store(),
    site(),
    mainSection("collection"),
  ]);
  const g = gridSettings(main?.settings);
  const result = await storefront.products({
    category: c.handle,
    sort,
    page,
    page_size: g.perPage,
  });
  const crumbs = [
    { name: "Home", href: "/" },
    ...c.ancestors.map((a) => ({ name: a.name, href: `/categories/${a.handle}` })),
    { name: c.name, href: `/categories/${c.handle}` },
  ];
  return (
    <TemplateSections
      template="collection"
      dynamic={{
        "collection.title": c.name,
        "collection.product_count": String(result.meta.total),
      }}
      main={() => (
        <div className="sf-container py-10 md:py-14">
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: jsonLd(
                breadcrumbJsonLd(crumbs.map((x) => ({ name: x.name, url: `${siteUrl}${x.href}` }))),
              ),
            }}
          />
          <Breadcrumbs items={crumbs} />
          <h1 className="mt-4 text-3xl md:text-5xl">{c.name}</h1>
          {g.showDescription && c.description_html && (
            <div
              className="sf-prose mt-4 max-w-2xl text-muted"
              dangerouslySetInnerHTML={{ __html: c.description_html }}
            />
          )}
          {c.children.length > 0 && (
            <nav aria-label="Subcategories" className="mt-6">
              <ul className="flex flex-wrap gap-2">
                {c.children.map((ch) => (
                  <li key={ch.handle}>
                    <Link
                      href={`/categories/${ch.handle}`}
                      className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm hover:bg-surface"
                    >
                      {ch.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <div className="mt-10">
            <ProductListing
              result={result}
              sort={sort}
              basePath={`/categories/${c.handle}`}
              locale={store.locale}
              columns={g.columns}
              showSort={g.showSort}
              empty={<p>No products in this category yet.</p>}
            />
          </div>
        </div>
      )}
    />
  );
}
