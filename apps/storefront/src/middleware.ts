import { NextResponse, type NextRequest } from "next/server";
import { NO_STORE_HEADER, SITE_HEADER, STORE_HEADER } from "./lib/site-headers";

/**
 * Shared storefront routing (P1): the request's host decides which store is
 * shown. <handle>.<platform domain> and verified custom domains resolve via
 * the API; unknown hosts fall back to STOREFRONT_STORE_ID when configured
 * (single-store installs), otherwise get a "store not found" page.
 */
const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const FALLBACK_STORE =
  process.env.STOREFRONT_STORE_ID ??
  (process.env.NODE_ENV === "production" ? "" : "00000000-0000-4000-8000-000000000001");
const FALLBACK_URL = (process.env.STOREFRONT_URL ?? "http://localhost:3100").replace(/\/+$/, "");
/** Addresses under the platform domain never fall back: an unknown one is simply not a store. */
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN?.toLowerCase();
const TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 15_000;

type Entry = { store: { store_id: string; url: string | null } | null; until: number };
const cache = new Map<string, Entry>();

async function resolve(host: string): Promise<Entry["store"]> {
  const hit = cache.get(host);
  if (hit && hit.until > Date.now()) return hit.store;
  let store: Entry["store"] = null;
  try {
    const res = await fetch(
      `${API_URL}/api/v1/storefront/resolve?host=${encodeURIComponent(host)}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (res.ok)
      store = ((await res.json()) as { data: { store_id: string; url: string | null } }).data;
    else if (res.status !== 404) return hit?.store ?? null; // API trouble: keep the last answer
  } catch {
    return hit?.store ?? null;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(host, { store, until: Date.now() + (store ? TTL_MS : NEGATIVE_TTL_MS) });
  return store;
}

export async function middleware(req: NextRequest) {
  // Behind the admin's rewrite (single-URL demo) the original host is forwarded.
  const raw = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const host = raw.split(",")[0]!.trim().toLowerCase().replace(/:\d+$/, "");
  const found = host ? await resolve(host) : null;
  const onPlatform =
    !!PLATFORM_DOMAIN && (host === PLATFORM_DOMAIN || host.endsWith(`.${PLATFORM_DOMAIN}`));
  const storeId = found?.store_id ?? (onPlatform ? "" : FALLBACK_STORE);
  const siteUrl = found?.url ?? FALLBACK_URL;

  const headers = new Headers(req.headers);
  headers.delete(STORE_HEADER);
  headers.delete(SITE_HEADER);
  headers.delete(NO_STORE_HEADER);
  if (!storeId) {
    headers.set(NO_STORE_HEADER, "1");
    return NextResponse.rewrite(new URL("/store-not-found", req.url), {
      status: 404,
      request: { headers },
    });
  }
  headers.set(STORE_HEADER, storeId);
  headers.set(SITE_HEADER, siteUrl);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except static assets and the API's revalidation hook.
  matcher: ["/((?!sf-static|_next/static|_next/image|api/revalidate|icon.svg|store-not-found).*)"],
};
