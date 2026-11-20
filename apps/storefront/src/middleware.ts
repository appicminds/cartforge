import { NextResponse, type NextRequest } from "next/server";
import {
  NO_STORE_HEADER,
  PREVIEW_COOKIE,
  PREVIEW_HEADER,
  PREVIEW_PARAM,
  SITE_HEADER,
  STORE_HEADER,
} from "./lib/site-headers";

/**
 * Shared storefront routing (P1): the request's host decides which store is
 * shown. <handle>.<platform domain> and verified custom domains resolve via
 * the API; unknown hosts fall back to STOREFRONT_STORE_ID when configured
 * (single-store installs), otherwise get a "store not found" page.
 *
 * Store preview: on that fallback address, `?store=<handle>` shows another store
 * that has no domain yet. The choice is kept in a cookie, the page is marked as a
 * preview (banner, noindex), and `?store=` ends it.
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

const HANDLE_RE = /^[a-z0-9-]{1,63}$/;
/** Cart cookies belong to one store; changing the previewed store starts a fresh cart. */
const CART_COOKIES = ["cf_cart", "cf_cart_count"];

type Entry = { store: { store_id: string; url: string | null } | null; until: number };
const cache = new Map<string, Entry>();

/** `key` is `host=<hostname>` or `handle=<store handle>`. */
async function resolve(key: string): Promise<Entry["store"]> {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.store;
  let store: Entry["store"] = null;
  try {
    const [kind, value] = key.split("=", 2) as [string, string];
    const res = await fetch(
      `${API_URL}/api/v1/storefront/resolve?${kind}=${encodeURIComponent(value)}`,
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
  cache.set(key, { store, until: Date.now() + (store ? TTL_MS : NEGATIVE_TTL_MS) });
  return store;
}

export async function middleware(req: NextRequest) {
  // Behind the admin's rewrite (single-URL demo) the original host is forwarded.
  const raw = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const host = raw.split(",")[0]!.trim().toLowerCase().replace(/:\d+$/, "");
  const found = host ? await resolve(`host=${host}`) : null;
  const onPlatform =
    !!PLATFORM_DOMAIN && (host === PLATFORM_DOMAIN || host.endsWith(`.${PLATFORM_DOMAIN}`));
  // Previews only exist on the fallback address, never on a store's own domain.
  const canPreview = !found && !onPlatform;

  const param = req.nextUrl.searchParams.get(PREVIEW_PARAM);
  if (canPreview && param !== null)
    return startOrEndPreview(req, raw.split(",")[0]!.trim(), param.trim().toLowerCase());

  const previewHandle = canPreview ? req.cookies.get(PREVIEW_COOKIE)?.value : undefined;
  const preview =
    previewHandle && HANDLE_RE.test(previewHandle)
      ? await resolve(`handle=${previewHandle}`)
      : null;
  const storeId = found?.store_id ?? preview?.store_id ?? (onPlatform ? "" : FALLBACK_STORE);
  const siteUrl = found?.url ?? FALLBACK_URL;

  const headers = new Headers(req.headers);
  headers.delete(STORE_HEADER);
  headers.delete(SITE_HEADER);
  headers.delete(NO_STORE_HEADER);
  headers.delete(PREVIEW_HEADER);
  if (!storeId) {
    headers.set(NO_STORE_HEADER, "1");
    return NextResponse.rewrite(new URL("/store-not-found", req.url), {
      status: 404,
      request: { headers },
    });
  }
  headers.set(STORE_HEADER, storeId);
  headers.set(SITE_HEADER, siteUrl);
  if (preview) headers.set(PREVIEW_HEADER, "1");
  const res = NextResponse.next({ request: { headers } });
  if (preview) res.headers.set("X-Robots-Tag", "noindex");
  // The previewed store was suspended or renamed: end the preview quietly.
  if (previewHandle && !preview) {
    res.cookies.delete(PREVIEW_COOKIE);
    for (const c of CART_COOKIES) res.cookies.delete(c);
  }
  return res;
}

/**
 * `?store=<handle>` starts a preview, `?store=` ends it; then the same page is
 * loaded without the parameter, on the public address the shopper used (which
 * differs from this app's own URL when the admin's domain proxies the storefront).
 */
async function startOrEndPreview(
  req: NextRequest,
  publicHost: string,
  handle: string,
): Promise<NextResponse> {
  const url = req.nextUrl.clone();
  url.searchParams.delete(PREVIEW_PARAM);
  if (publicHost) url.host = publicHost;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto === "http" || proto === "https") url.protocol = `${proto}:`;
  const res = NextResponse.redirect(url, 307);
  res.headers.set("Cache-Control", "no-store");
  const current = req.cookies.get(PREVIEW_COOKIE)?.value;
  const target = handle && HANDLE_RE.test(handle) ? await resolve(`handle=${handle}`) : null;
  if (target) {
    res.cookies.set(PREVIEW_COOKIE, handle, {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: "/",
    });
  } else {
    res.cookies.delete(PREVIEW_COOKIE);
  }
  if ((target ? handle : undefined) !== current)
    for (const c of CART_COOKIES) res.cookies.delete(c);
  return res;
}

export const config = {
  // Everything except static assets and the API's revalidation hook.
  matcher: ["/((?!sf-static|_next/static|_next/image|api/revalidate|icon.svg|store-not-found).*)"],
};
