import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { TemplateSections } from "@/components/theme/render";
import { storefront } from "@/lib/api";

type Props = { params: Promise<{ handle: string }> };

async function load(handle: string) {
  const r = await storefront.page(handle);
  if (r.kind !== "ok") notFound();
  return r.data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).handle);
  const path = `/pages/${p.handle}`;
  return {
    title: p.seo.title,
    description: p.seo.description || undefined,
    alternates: { canonical: path },
    openGraph: { title: p.seo.title, description: p.seo.description || undefined, url: path },
  };
}

/** Content pages (About us, Contact, policies) inside the theme's "Pages" template. */
export default async function ContentPage({ params }: Props) {
  const p = await load((await params).handle);
  return (
    <TemplateSections
      template="page"
      main={(main) => (
        <div
          className={`sf-container py-10 md:py-14 ${main.settings.width === "wide" ? "max-w-5xl" : "max-w-3xl"}`}
        >
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: p.title }]} />
          <h1 className="mt-4 text-3xl md:text-5xl">{p.title}</h1>
          <div
            className="sf-prose mt-8"
            // Sanitized by the API against an allow-list when saved.
            dangerouslySetInnerHTML={{ __html: p.body_html }}
          />
        </div>
      )}
    />
  );
}
