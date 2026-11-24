import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Pagination } from "@/components/pagination";
import { ArticleCard } from "@/components/theme/blog";
import { mainSection, TemplateSections } from "@/components/theme/render";
import { LG_COLS, MD_COLS } from "@/components/theme/shared";
import { storefront } from "@/lib/api";

type Props = {
  params: Promise<{ blog: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function load(
  handle: string,
  sp: Record<string, string | string[] | undefined>,
  perPage: number,
) {
  const page = Math.min(500, Math.max(1, Number.parseInt(one(sp.page), 10) || 1));
  const tag = one(sp.tag).slice(0, 40);
  const r = await storefront.blog(handle, page, tag, perPage);
  if (r.kind !== "ok") notFound();
  return { blog: r.data, page, tag };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { blog } = await load((await params).blog, await searchParams, 12);
  return { title: blog.title, alternates: { canonical: `/blogs/${blog.handle}` } };
}

/** A blog: its posts, newest first, with a tag filter. */
export default async function BlogPage({ params, searchParams }: Props) {
  const main = await mainSection("blog");
  const s = main?.settings ?? {};
  const perPage = typeof s.per_page === "number" ? s.per_page : 12;
  const { blog, page, tag } = await load((await params).blog, await searchParams, perPage);
  const list = s.layout === "list";
  const cols = Math.min(4, Math.max(1, typeof s.columns === "number" ? s.columns : 3));
  const base = `/blogs/${blog.handle}`;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (tag) qs.set("tag", tag);
    if (p > 1) qs.set("page", String(p));
    const q = qs.toString();
    return q ? `${base}?${q}` : base;
  };
  return (
    <TemplateSections
      template="blog"
      dynamic={{ "blog.title": blog.title }}
      main={() => (
        <div className="sf-container py-10 md:py-14">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: blog.title }]} />
          <h1 className="mt-4 text-3xl md:text-5xl">{blog.title}</h1>
          {s.show_tags !== false && blog.tags.length > 0 && (
            <nav aria-label="Filter by tag" className="mt-6">
              <ul className="flex flex-wrap gap-2">
                {["", ...blog.tags].map((t) => (
                  <li key={t || "all"}>
                    <Link
                      href={t ? `${base}?tag=${encodeURIComponent(t)}` : base}
                      aria-current={tag === t ? "page" : undefined}
                      className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm ${tag === t ? "border-ink bg-ink text-bg" : "border-line hover:bg-surface"}`}
                    >
                      {t || "All"}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {blog.articles.length === 0 ? (
            <p className="py-16 text-center text-muted">No posts yet.</p>
          ) : (
            <ul
              className={`mt-10 grid gap-10 ${list ? "" : `sm:grid-cols-2 ${MD_COLS[cols]} ${LG_COLS[cols]}`}`}
            >
              {blog.articles.map((a) => (
                <li key={a.handle}>
                  <ArticleCard
                    a={a}
                    headingLevel="h2"
                    o={{
                      image: s.show_image !== false,
                      date: s.show_date !== false,
                      author: s.show_author === true,
                      excerpt: s.show_excerpt !== false,
                      list,
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
          <Pagination page={page} totalPages={blog.meta.total_pages} href={href} />
        </div>
      )}
    />
  );
}
