import type { SectionInstance } from "@cartforge/theme-engine";
import type { StorefrontArticleSummary } from "@cartforge/types";
import Link from "next/link";
import { storefront } from "@/lib/api";
import { bool, LG_COLS, MD_COLS, num, SectionHeading, Shell, str, type SectionCtx } from "./shared";

export const formatDate = (iso: string | null, locale?: string) =>
  iso
    ? new Date(iso).toLocaleDateString(locale ?? "en", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

export interface CardOptions {
  image: boolean;
  date: boolean;
  author: boolean;
  excerpt: boolean;
  list?: boolean;
}

export function ArticleCard({
  a,
  o,
  locale,
  headingLevel = "h3",
}: {
  a: StorefrontArticleSummary;
  o: CardOptions;
  locale?: string;
  headingLevel?: "h2" | "h3";
}) {
  const H = headingLevel;
  const href = `/blogs/${a.blog_handle}/${a.handle}`;
  const img = a.image;
  return (
    <article
      className={`group relative flex gap-5 ${o.list ? "flex-col sm:flex-row" : "flex-col"}`}
    >
      {o.image && (
        <div
          className={`overflow-hidden rounded-[var(--sf-card-radius)] bg-surface ${o.list ? "aspect-[4/3] sm:w-72 sm:shrink-0" : "aspect-[4/3]"}`}
        >
          {img && (
            <img
              src={img.medium_url ?? img.url}
              alt={img.alt ?? ""}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {(o.date || o.author) && (
          <p className="text-xs uppercase tracking-wider text-muted">
            {[o.date && formatDate(a.published_at, locale), o.author && a.author]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <H className="text-xl leading-snug">
          <Link
            href={href}
            className="after:absolute after:inset-0 hover:underline hover:underline-offset-4"
          >
            {a.title}
          </Link>
        </H>
        {o.excerpt && a.excerpt && <p className="line-clamp-3 text-muted">{a.excerpt}</p>}
      </div>
    </article>
  );
}

/** "Blog posts" section: the latest posts of a blog. */
export async function FeaturedBlog({
  section,
  ctx,
}: {
  section: SectionInstance;
  ctx: SectionCtx;
}) {
  const s = section.settings;
  let handle = str(s, "blog");
  if (!handle) handle = (await storefront.blogs())[0]?.handle ?? "";
  if (!handle) return null;
  const r = await storefront.blog(handle, 1, "", num(s, "limit", 3));
  if (r.kind !== "ok" || !r.data.articles.length) return null;
  const cols = Math.min(4, Math.max(1, num(s, "columns", 3)));
  return (
    <Shell section={section} as="section" label={str(s, "heading") || r.data.title}>
      <div className="sf-section sf-container">
        <SectionHeading
          title={str(s, "heading") || r.data.title}
          href={`/blogs/${r.data.handle}`}
          linkLabel="All posts"
        />
        <ul className={`grid gap-8 sm:grid-cols-2 ${MD_COLS[cols]} ${LG_COLS[cols]}`}>
          {r.data.articles.map((a) => (
            <li key={a.handle}>
              <ArticleCard
                a={a}
                locale={ctx.store.locale}
                o={{
                  image: bool(s, "show_image"),
                  date: bool(s, "show_date"),
                  author: false,
                  excerpt: bool(s, "show_excerpt"),
                }}
              />
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}
