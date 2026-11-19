import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@cartforge/ui"],
  // Same-origin API: the browser only ever talks to the admin origin, so the
  // session cookie stays first-party and CSRF checks stay simple. In production
  // Caddy does this routing; the rewrite covers development and `next start`.
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` },
      { source: "/api/docs/:path*", destination: `${API_URL}/api/docs/:path*` },
      { source: "/api/docs", destination: `${API_URL}/api/docs` },
    ];
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
    ];
  },
};

export default config;
