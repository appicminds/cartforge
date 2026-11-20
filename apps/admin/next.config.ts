import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
/**
 * Optional: the storefront app's own URL. When set, this domain serves the
 * storefront at "/" and every path the admin doesn't own (single public URL),
 * while /admin, /login and /api stay here. Read at build time.
 */
const STOREFRONT_ORIGIN = process.env.STOREFRONT_ORIGIN?.replace(/\/+$/, "");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@cartforge/ui"],
  // Same-origin API: the browser only ever talks to the admin origin, so the
  // session cookie stays first-party and CSRF checks stay simple. In production
  // Caddy does this routing; the rewrite covers development and `next start`.
  async rewrites() {
    const api = [
      { source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` },
      { source: "/api/docs/:path*", destination: `${API_URL}/api/docs/:path*` },
      { source: "/api/docs", destination: `${API_URL}/api/docs` },
    ];
    if (!STOREFRONT_ORIGIN) return api;
    return {
      // "/" is the storefront home, ahead of the admin's own root redirect.
      beforeFiles: [{ source: "/", destination: `${STOREFRONT_ORIGIN}/` }],
      afterFiles: api,
      // Anything the admin doesn't serve (products, collections, sitemap, the
      // storefront's /sf-static assets…) belongs to the storefront.
      fallback: [{ source: "/:path*", destination: `${STOREFRONT_ORIGIN}/:path*` }],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Back office never appears in search results.
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/login", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default config;
