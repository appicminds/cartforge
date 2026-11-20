import { RenderSection } from "@/components/sections/sections";
import { storefront } from "@/lib/api";
import { site } from "@/lib/config";
import { jsonLd } from "@/lib/seo";
import { getTheme } from "@/lib/theme";

export default async function Home() {
  const [store, { siteUrl }] = await Promise.all([storefront.store(), site()]);
  const { sections } = getTheme().templates.home;
  const hasHero = sections[0]?.type === "hero";
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
      {!hasHero && <h1 className="sr-only">{store.name}</h1>}
      {sections.map((s, i) => (
        <RenderSection key={s.id} section={s} ctx={{ store, first: i === 0 }} />
      ))}
    </>
  );
}
