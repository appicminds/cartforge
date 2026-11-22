import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
/** The admin may show the storefront in its theme editor's preview frame. */
const FRAME_ANCESTORS = [
  "'self'",
  ...(process.env.ADMIN_URL ?? "http://localhost:3000")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\/[^\s;'"]+$/.test(u))
    .map((u) => new URL(u).origin),
].join(" ");

/**
 * The storefront is a separate Next.js app ("zone"). On the hosted demo it is
 * served at the root of the admin's domain through a fallback rewrite, so its
 * own assets live under a prefix that can't collide with the admin's /_next.
 */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  assetPrefix: "/sf-static",
  async rewrites() {
    return [
      // Images stored by the API's local driver are served by the API.
      { source: "/api/v1/media/files/:path*", destination: `${API_URL}/api/v1/media/files/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: `frame-ancestors ${FRAME_ANCESTORS}` },
        ],
      },
      {
        // Private order links must not leak through the Referer header.
        source: "/orders/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        source: "/(cart|checkout)",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/preview/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default config;
