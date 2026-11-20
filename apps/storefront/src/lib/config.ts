import "server-only";

/** Seeded demo store, used when STOREFRONT_STORE_ID isn't set (development). */
const DEV_STORE = "00000000-0000-4000-8000-000000000001";

export const config = {
  apiUrl: (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, ""),
  storeId: process.env.STOREFRONT_STORE_ID ?? DEV_STORE,
  /** Public origin, for canonical URLs, Open Graph and the sitemap. */
  siteUrl: (process.env.STOREFRONT_URL ?? "http://localhost:3100").replace(/\/+$/, ""),
  revalidateSecret: process.env.STOREFRONT_REVALIDATE_SECRET ?? "",
};
