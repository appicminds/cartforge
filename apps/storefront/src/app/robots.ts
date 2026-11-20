import type { MetadataRoute } from "next";
import { site } from "@/lib/config";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { siteUrl } = await site();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/search", "/preview/", "/api/", "/cart", "/checkout", "/orders/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
