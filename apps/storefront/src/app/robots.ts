import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/search", "/preview/", "/api/", "/cart", "/checkout", "/orders/"],
      },
    ],
    sitemap: `${config.siteUrl}/sitemap.xml`,
  };
}
