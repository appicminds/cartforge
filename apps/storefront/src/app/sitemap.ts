import type { MetadataRoute } from "next";
import { storefront } from "@/lib/api";
import { site } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const map = await storefront.sitemap();
  const { siteUrl } = await site();
  const u = (path: string) => `${siteUrl}${path}`;
  return [
    { url: u("/"), changeFrequency: "daily", priority: 1 },
    { url: u("/products"), changeFrequency: "daily", priority: 0.8 },
    { url: u("/collections"), changeFrequency: "weekly", priority: 0.5 },
    ...map.categories.map((c) => ({
      url: u(`/categories/${c.handle}`),
      lastModified: c.updated_at,
      priority: 0.7,
    })),
    ...map.collections.map((c) => ({
      url: u(`/collections/${c.handle}`),
      lastModified: c.updated_at,
      priority: 0.7,
    })),
    ...map.products.map((p) => ({
      url: u(`/products/${p.handle}`),
      lastModified: p.updated_at,
      priority: 0.6,
    })),
  ];
}
