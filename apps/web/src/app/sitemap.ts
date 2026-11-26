import type { MetadataRoute } from "next";
import { LEGAL } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    ...LEGAL.map((d) => ({
      url: `${SITE_URL}/legal/${d.slug}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
