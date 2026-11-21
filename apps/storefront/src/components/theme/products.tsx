import type { SectionInstance } from "@cartforge/theme-engine";
import type { StorefrontProduct } from "@cartforge/types";
import Link from "next/link";
import { storefront } from "@/lib/api";
import { ProductGrid } from "../product-card";
import { bool, LG_COLS, MD_COLS, num, SectionHeading, Shell, str, type SectionCtx } from "./shared";

const RATIO: Record<string, string> = {
  square: "aspect-square",
  portrait: "aspect-[4/5]",
  landscape: "aspect-[4/3]",
};

function Grid({
  section,
  ctx,
  title,
  href,
  products,
}: {
  section: SectionInstance;
  ctx: SectionCtx;
  title: string;
  href?: string;
  products: StorefrontProduct[];
}) {
  const id = `h-${section.id}`;
  return (
    <Shell section={section} as="section" label={title || undefined}>
      <div className="sf-section sf-container">
        {title && <SectionHeading id={id} title={title} href={href} />}
        <ProductGrid
          products={products}
          locale={ctx.store.locale}
          eager={ctx.first ? 4 : 0}
          columns={num(section.settings, "columns", 4)}
        />
      </div>
    </Shell>
  );
}

export async function FeaturedCollection({
  section,
  ctx,
}: {
  section: SectionInstance;
  ctx: SectionCtx;
}) {
  const s = section.settings;
  const all = await storefront.collections();
  const col = str(s, "collection")
    ? all.find((c) => c.handle === str(s, "collection"))
    : all.find((c) => c.product_count > 0);
  if (!col) return null;
  const res = await storefront.products({ collection: col.handle, page_size: num(s, "limit", 4) });
  if (!res.data.length) return null;
  return (
    <Grid
      section={section}
      ctx={ctx}
      title={str(s, "heading") || col.title}
      href={bool(s, "show_view_all") ? `/collections/${col.handle}` : undefined}
      products={res.data}
    />
  );
}

export async function FeaturedProducts({
  section,
  ctx,
}: {
  section: SectionInstance;
  ctx: SectionCtx;
}) {
  const s = section.settings;
  const handles = (Array.isArray(s.products) ? s.products : []) as string[];
  const found = handles.length
    ? (await Promise.all(handles.map((h) => storefront.product(h))))
        .map((r) => (r.kind === "ok" ? r.data : null))
        .filter((p): p is StorefrontProduct => !!p)
    : (await storefront.products({ sort: "featured", page_size: 4 })).data;
  if (!found.length) return null;
  return <Grid section={section} ctx={ctx} title={str(s, "heading")} products={found} />;
}

export async function NewArrivals({ section, ctx }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const res = await storefront.products({ sort: "newest", page_size: num(s, "limit", 8) });
  if (!res.data.length) return null;
  return (
    <Grid
      section={section}
      ctx={ctx}
      title={str(s, "heading")}
      href="/products?sort=newest"
      products={res.data}
    />
  );
}

export async function ProductRecommendations({
  section,
  ctx,
}: {
  section: SectionInstance;
  ctx: SectionCtx;
}) {
  const s = section.settings;
  const p = ctx.product;
  if (!p) return null;
  const limit = num(s, "limit", 4);
  const category = p.categories[0]?.handle;
  let list = category ? (await storefront.products({ category, page_size: limit + 1 })).data : [];
  if (list.filter((x) => x.id !== p.id).length < 2)
    list = (await storefront.products({ sort: "newest", page_size: limit + 1 })).data;
  const others = list.filter((x) => x.id !== p.id).slice(0, limit);
  if (!others.length) return null;
  return <Grid section={section} ctx={ctx} title={str(s, "heading")} products={others} />;
}

/** One cached lookup per tile for a representative image. */
async function coverFor(q: { collection?: string; category?: string }) {
  return (await storefront.products({ ...q, page_size: 1 })).data[0]?.images[0];
}

function Tiles({
  section,
  title,
  tiles,
  ratio,
}: {
  section: SectionInstance;
  title: string;
  tiles: {
    key: string;
    href: string;
    name: string;
    count: number;
    image?: { url: string; medium_url: string | null };
  }[];
  ratio: string;
}) {
  const cols = Math.min(5, Math.max(1, num(section.settings, "columns", 3)));
  return (
    <Shell section={section} as="section" label={title || undefined}>
      <div className="sf-section sf-container">
        {title && <SectionHeading title={title} />}
        <ul className={`grid grid-cols-2 gap-4 lg:gap-6 ${MD_COLS[cols]} ${LG_COLS[cols]}`}>
          {tiles.map((t) => (
            <li
              key={t.key}
              className="group relative overflow-hidden rounded-[calc(var(--sf-radius)/2)] bg-surface"
            >
              <div className={RATIO[ratio] ?? RATIO.landscape}>
                {t.image && (
                  <img
                    src={t.image.medium_url ?? t.image.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12">
                <h3 className="font-body text-lg font-semibold text-white">
                  <Link href={t.href} className="after:absolute after:inset-0">
                    {t.name}
                  </Link>
                </h3>
                <p className="text-sm text-white/90">
                  {t.count} {t.count === 1 ? "product" : "products"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

export async function CollectionList({ section }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const chosen = (Array.isArray(s.collections) ? s.collections : []) as string[];
  const all = await storefront.collections();
  const list = chosen.length
    ? chosen
        .map((h) => all.find((c) => c.handle === h))
        .filter((c): c is (typeof all)[number] => !!c)
    : all.filter((c) => c.product_count > 0).slice(0, 6);
  if (!list.length) return null;
  const covers = await Promise.all(list.map((c) => coverFor({ collection: c.handle })));
  return (
    <Tiles
      section={section}
      title={str(s, "heading")}
      ratio={str(s, "image_ratio")}
      tiles={list.map((c, i) => ({
        key: c.id,
        href: `/collections/${c.handle}`,
        name: c.title,
        count: c.product_count,
        image: covers[i],
      }))}
    />
  );
}

export async function CategoryList({ section }: { section: SectionInstance; ctx: SectionCtx }) {
  const s = section.settings;
  const top = (await storefront.categories())
    .filter((c) => c.depth === 0 && c.product_count > 0)
    .slice(0, num(s, "limit", 6));
  if (!top.length) return null;
  const covers = await Promise.all(top.map((c) => coverFor({ category: c.handle })));
  return (
    <Tiles
      section={section}
      title={str(s, "heading")}
      ratio="landscape"
      tiles={top.map((c, i) => ({
        key: c.id,
        href: `/categories/${c.handle}`,
        name: c.name,
        count: c.product_count,
        image: covers[i],
      }))}
    />
  );
}
