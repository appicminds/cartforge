import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { formatDate } from "@/components/theme/blog";
import { mainSection, TemplateSections } from "@/components/theme/render";
import { storefront } from "@/lib/api";
import { site } from "@/lib/config";
import { jsonLd } from "@/lib/seo";

type Props = { params: Promise<{ blog: string; article: string }> };

async function load(blog: string, handle: string) {
  const r = await storefront.article(blog, handle);
  if (r.kind !== "ok") notFound();
  return r.data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const a = await load(p.blog, p.article);
  const path = `/blogs/${a.blog_handle}/${a.handle}`;
  const img = a.image;
  return {
    title: a.seo.title,
    description: a.seo.description || undefined,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: a.seo.title,
      description: a.seo.description || undefined,
      url: path,
      publishedTime: a.published_at ?? undefined,
      images: img ? [{ url: img.large_url ?? img.url, alt: img.alt ?? a.title }] : undefined,
    },
  };
}

/** A blog post inside the theme's "Blog posts" template. */
export default async function ArticlePage({ params }: Props) {
  const p = await params;
  const [a, store, { siteUrl }, main] = await Promise.all([
    load(p.blog, p.article),
    storefront.store(),
    site(),
    mainSection("article"),
  ]);
  const s = main?.settings ?? {};
  const url = `${siteUrl}/blogs/${a.blog_handle}/${a.handle}`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.title,
    datePublished: a.published_at ?? undefined,
    dateModified: a.updated_at,
    author: a.author ? { "@type": "Person", name: a.author } : undefined,
    image: a.image ? (a.image.large_url ?? a.image.url) : undefined,
    mainEntityOfPage: url,
  };
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(a.title);
  return (
    <TemplateSections
      template="article"
      dynamic={{
        "article.title": a.title,
        "article.author": a.author ?? "",
        "article.date": formatDate(a.published_at, store.locale),
        "blog.title": a.blog_title,
      }}
      main={() => (
        <article
          className={`sf-container py-10 md:py-14 ${s.width === "wide" ? "max-w-5xl" : "max-w-3xl"}`}
        >
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
          <Breadcrumbs
            items={[
              { name: "Home", href: "/" },
              { name: a.blog_title, href: `/blogs/${a.blog_handle}` },
              { name: a.title },
            ]}
          />
          <h1 className="mt-4 text-3xl md:text-5xl">{a.title}</h1>
          {(s.show_date !== false || (s.show_author !== false && a.author)) && (
            <p className="mt-3 text-sm uppercase tracking-wider text-muted">
              {[
                s.show_date !== false && formatDate(a.published_at, store.locale),
                s.show_author !== false && a.author,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {s.show_image !== false && a.image && (
            <img
              src={a.image.large_url ?? a.image.url}
              alt={a.image.alt ?? ""}
              width={a.image.width ?? undefined}
              height={a.image.height ?? undefined}
              fetchPriority="high"
              className="mt-8 h-auto w-full rounded-[var(--sf-card-radius)]"
            />
          )}
          <div
            className="sf-prose mt-8"
            // Sanitized by the API against an allow-list when saved.
            dangerouslySetInnerHTML={{ __html: a.body_html }}
          />
          {s.show_tags !== false && a.tags.length > 0 && (
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Tags">
              {a.tags.map((tag) => (
                <li key={tag}>
                  <Link
                    href={`/blogs/${a.blog_handle}?tag=${encodeURIComponent(tag)}`}
                    className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-sm hover:bg-surface"
                  >
                    {tag}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {s.show_share !== false && (
            <p className="mt-8 flex flex-wrap items-center gap-4 border-t border-line pt-6 text-sm">
              <span className="text-muted">Share:</span>
              <a
                className="sf-link"
                href={`https://wa.me/?text=${t}%20${u}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
              <a
                className="sf-link"
                href={`https://www.facebook.com/sharer/sharer.php?u=${u}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Facebook
              </a>
              <a
                className="sf-link"
                href={`https://x.com/intent/post?url=${u}&text=${t}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                X
              </a>
            </p>
          )}
        </article>
      )}
    />
  );
}
