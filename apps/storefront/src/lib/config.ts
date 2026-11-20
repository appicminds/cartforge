import "server-only";
import { headers } from "next/headers";
import { SITE_HEADER, STORE_HEADER } from "./site-headers";

/** Seeded demo store, used when STOREFRONT_STORE_ID isn't set (development). */
const DEV_STORE = "00000000-0000-4000-8000-000000000001";

export const config = {
  apiUrl: (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, ""),
  /** Fallback store for hosts that aren't a known store domain (single-store installs, previews). */
  storeId: process.env.STOREFRONT_STORE_ID ?? DEV_STORE,
  /** Fallback public origin for that store. */
  siteUrl: (process.env.STOREFRONT_URL ?? "http://localhost:3100").replace(/\/+$/, ""),
  revalidateSecret: process.env.STOREFRONT_REVALIDATE_SECRET ?? "",
};

/**
 * The store this request is for. The middleware resolves the domain
 * (shop.example.com → store) and passes it on in trusted request headers.
 */
export async function site(): Promise<{ storeId: string; siteUrl: string }> {
  const h = await headers();
  return {
    storeId: h.get(STORE_HEADER) ?? config.storeId,
    siteUrl: (h.get(SITE_HEADER) ?? config.siteUrl).replace(/\/+$/, ""),
  };
}
