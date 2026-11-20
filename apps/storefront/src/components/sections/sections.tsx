import type { Section, SectionSettings } from "@cartforge/theme-engine";
import type { StorefrontStore } from "@cartforge/types";
import Link from "next/link";
import { storefront } from "@/lib/api";
import { ProductGrid } from "../product-card";

interface Ctx {
  store: StorefrontStore;
  /** First section gets eager images and the page's h1. */
  first: boolean;
}

function SectionHeading({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <h2 className="text-2xl md:text-3xl">{title}</h2>
      {href && (
        <Link href={href} className="sf-link shrink-0 text-sm">
          {linkLabel ?? "View all"}
        </Link>
      )}
    </div>
  );
}

function Hero({ s, ctx }: { s: SectionSettings<"hero">; ctx: Ctx }) {
  const Heading = ctx.first ? "h1" : "h2";
  return (
    <section className="bg-surface">
      <div
        className={`sf-container flex min-h-[22rem] flex-col justify-center gap-6 py-16 md:min-h-[30rem] md:py-24 ${s.alignment === "center" ? "items-center text-center" : "items-start"}`}
      >
        <Heading className="max-w-3xl text-4xl leading-[1.05] md:text-6xl">
          {s.heading || ctx.store.name}
        </Heading>
        {s.subheading && <p className="max-w-xl text-lg text-muted md:text-xl">{s.subheading}</p>}
        {s.button_label && (
          <Link href={s.button_link} className="sf-button">
            {s.button_label}
          </Link>
        )}
      </div>
    </section>
  );
}

async function FeaturedCollection({
  s,
  ctx,
}: {
  s: SectionSettings<"featured_collection">;
  ctx: Ctx;
}) {
  const all = await storefront.collections();
  const col = s.collection
    ? all.find((c) => c.handle === s.collection)
    : all.find((c) => c.product_count > 0);
  if (!col) return null;
  const res = await storefront.products({ collection: col.handle, page_size: s.limit });
  if (!res.data.length) return null;
  return (
    <section className="sf-section sf-container" aria-labelledby={`sec-${col.id}`}>
      <div id={`sec-${col.id}`}>
        <SectionHeading title={s.heading || col.title} href={`/collections/${col.handle}`} />
      </div>
      <ProductGrid products={res.data} locale={ctx.store.locale} eager={ctx.first ? 4 : 0} />
    </section>
  );
}

async function NewArrivals({ s, ctx }: { s: SectionSettings<"new_arrivals">; ctx: Ctx }) {
  const res = await storefront.products({ sort: "newest", page_size: s.limit });
  if (!res.data.length) return null;
  return (
    <section className="sf-section sf-container">
      <SectionHeading title={s.heading} href="/products?sort=newest" />
      <ProductGrid products={res.data} locale={ctx.store.locale} eager={ctx.first ? 4 : 0} />
    </section>
  );
}

async function CategoryList({ s }: { s: SectionSettings<"category_list">; ctx: Ctx }) {
  const top = (await storefront.categories())
    .filter((c) => c.depth === 0 && c.product_count > 0)
    .slice(0, s.limit);
  if (!top.length) return null;
  // One cached lookup per tile for a representative image.
  const covers = await Promise.all(
    top.map((c) => storefront.products({ category: c.handle, page_size: 1 })),
  );
  return (
    <section className="sf-section sf-container">
      <SectionHeading title={s.heading} />
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:gap-6">
        {top.map((c, i) => {
          const img = covers[i]?.data[0]?.images[0];
          return (
            <li
              key={c.id}
              className="group relative overflow-hidden rounded-[calc(var(--sf-radius)/2)] bg-surface"
            >
              <div className="aspect-[4/3]">
                {img && (
                  <img
                    src={img.medium_url ?? img.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12">
                <h3 className="font-body text-lg font-semibold text-white">
                  <Link href={`/categories/${c.handle}`} className="after:absolute after:inset-0">
                    {c.name}
                  </Link>
                </h3>
                <p className="text-sm text-white/90">
                  {c.product_count} {c.product_count === 1 ? "product" : "products"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RichText({ s }: { s: SectionSettings<"rich_text">; ctx: Ctx }) {
  if (!s.heading && !s.body) return null;
  return (
    <section className="sf-section sf-container max-w-3xl text-center">
      {s.heading && <h2 className="text-2xl md:text-3xl">{s.heading}</h2>}
      {s.body
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="mt-4 text-lg text-muted">
            {p}
          </p>
        ))}
    </section>
  );
}

/** Registered components for each section type (PRD §11.2). */
export async function RenderSection({ section, ctx }: { section: Section; ctx: Ctx }) {
  switch (section.type) {
    case "hero":
      return <Hero s={section.settings} ctx={ctx} />;
    case "featured_collection":
      return <FeaturedCollection s={section.settings} ctx={ctx} />;
    case "new_arrivals":
      return <NewArrivals s={section.settings} ctx={ctx} />;
    case "category_list":
      return <CategoryList s={section.settings} ctx={ctx} />;
    case "rich_text":
      return <RichText s={section.settings} ctx={ctx} />;
  }
}
