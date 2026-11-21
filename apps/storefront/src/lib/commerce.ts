import "server-only";
import type {
  CartView,
  CheckoutUpdateInput,
  CheckoutView,
  FieldError,
  OrderConfirmation,
  PaymentRedirect,
  PlacedOrder,
} from "./commerce-types";
import { cookies, headers } from "next/headers";
import { config, site } from "./config";

export const CART_COOKIE = "cf_cart";
/** Readable count for the header badge (no secret in it). */
export const CART_COUNT_COOKIE = "cf_cart_count";

export interface ApiFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
  fields: FieldError[];
}
export type ApiResult<T> = { ok: true; data: T; status: number; headers: Headers } | ApiFailure;

async function call<T>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string>; storeId?: string } = {},
): Promise<ApiResult<T>> {
  const storeId = opts.storeId ?? (await site()).storeId;
  const res = await fetch(`${config.apiUrl}/api/v1/storefront${path}`, {
    method,
    cache: "no-store",
    headers: {
      "X-Store-Id": storeId,
      Accept: "application/json",
      ...(opts.body !== undefined && { "Content-Type": "application/json" }),
      ...(opts.token && { "X-Cart-Token": opts.token }),
      ...opts.headers,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { code: string; message: string; fields?: FieldError[] };
  };
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      code: json.error?.code ?? "ERROR",
      message: json.error?.message ?? "Something went wrong. Please try again.",
      fields: json.error?.fields ?? [],
    };
  }
  return { ok: true, data: json.data as T, status: res.status, headers: res.headers };
}

export async function cartToken(): Promise<string | undefined> {
  return (await cookies()).get(CART_COOKIE)?.value;
}

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

/** Only callable from server actions / route handlers. */
export async function rememberCart(token: string, count: number) {
  const jar = await cookies();
  jar.set(CART_COOKIE, token, cookieOpts);
  jar.set(CART_COUNT_COOKIE, String(count), { ...cookieOpts, httpOnly: false });
}

export async function forgetCart() {
  const jar = await cookies();
  jar.delete(CART_COOKIE);
  jar.delete(CART_COUNT_COOKIE);
}

export async function setCount(count: number) {
  (await cookies()).set(CART_COUNT_COOKIE, String(count), { ...cookieOpts, httpOnly: false });
}

async function shopperIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || h.get("x-real-ip") || "";
}

/** The public address this request came in on (behind the admin's proxy too). */
async function shopperOrigin(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]!.trim();
  const proto =
    (h.get("x-forwarded-proto") ?? "").split(",")[0]!.trim() ||
    (host.includes("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

export const commerce = {
  createCart: async () =>
    call<{ token: string; cart: CartView }>("POST", "/cart", {
      headers: { "X-Shopper-IP": await shopperIp() },
    }),
  getCart: (token: string) => call<CartView>("GET", "/cart", { token }),
  addLine: (token: string, variant_id: string, quantity: number) =>
    call<CartView>("POST", "/cart/lines", { token, body: { variant_id, quantity } }),
  updateLine: (token: string, id: string, quantity: number) =>
    call<CartView>("PATCH", `/cart/lines/${encodeURIComponent(id)}`, { token, body: { quantity } }),
  removeLine: (token: string, id: string) =>
    call<CartView>("DELETE", `/cart/lines/${encodeURIComponent(id)}`, { token }),
  openCheckout: (token: string) => call<CheckoutView>("POST", "/checkout", { token }),
  updateCheckout: (token: string, body: CheckoutUpdateInput) =>
    call<CheckoutView>("PATCH", "/checkout", { token, body }),
  complete: (token: string, key: string, expected_total_minor: number) =>
    call<PlacedOrder>("POST", "/checkout/complete", {
      token,
      body: { expected_total_minor },
      headers: { "Idempotency-Key": key },
    }),
  order: (id: string, key: string) =>
    call<OrderConfirmation>("GET", `/orders/${encodeURIComponent(id)}`, {
      headers: { "X-Order-Key": key },
    }),
  /** Next 5: start (or retry) paying online; answers where to send the shopper. */
  startPayment: async (id: string, key: string) =>
    call<PaymentRedirect>("POST", `/orders/${encodeURIComponent(id)}/payment`, {
      headers: { "X-Order-Key": key, "X-Shopper-Origin": await shopperOrigin() },
    }),
  /** What the provider sent back, verified by the API. */
  paymentReturn: (provider: string, params: Record<string, string>, storeId?: string) =>
    call<{ order_id: string | null; outcome: string; redirect: PaymentRedirect | null }>(
      "POST",
      `/payments/${encodeURIComponent(provider)}/return`,
      { body: { params }, storeId },
    ),
};

/** Remembers the last order's private key in this browser, for the trip to the payment page and back. */
export const LAST_ORDER_COOKIE = "cf_last_order";

/** The current cart for rendering, or null (no cookie, expired, or converted). */
export async function currentCart(): Promise<{ token: string; cart: CartView } | null> {
  const token = await cartToken();
  if (!token) return null;
  const r = await commerce.getCart(token);
  return r.ok ? { token, cart: r.data } : null;
}
