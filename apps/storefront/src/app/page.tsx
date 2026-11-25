import { TemplateSections } from "@/components/theme/render";
import { storefront } from "@/lib/api";
import { site } from "@/lib/config";
import { jsonLd } from "@/lib/seo";
import { templateSections } from "@/lib/theme";

/** Sections that put the page's h1 in their first heading. */
const H1_SECTIONS = new Set([
  "hero",
  "image_banner",
  "slideshow",
  "rich_text",
  "image_with_text",
  "custom_section",
]);

export default async function Home() {
  const [store, { siteUrl }, sections] = await Promise.all([
    storefront.store(),
    site(),
    templateSections("home"),
  ]);
  const first = sections[0];
  const hasH1 =
    !!first &&
    H1_SECTIONS.has(first.type) &&
    (first.type !== "custom_section" ||
      first.blocks.some((b) => b.type === "heading" && !b.disabled));
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: store.name,
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(website) }} />
      {!hasH1 && <h1 className="sr-only">{store.name}</h1>}
      <TemplateSections template="home" />
    </>
  );
}
