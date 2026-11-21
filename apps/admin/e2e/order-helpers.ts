/** Places real orders through the public storefront API (shared by the order tests). */
export const API = "http://localhost:4000/api/v1";
const ORIGIN = "http://localhost:3000";
const STORE = "00000000-0000-4000-8000-000000000001";

async function json(res: Response) {
  const body = (await res.json()) as { data: never; error?: unknown };
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body.error)}`);
  return body.data;
}

/** Places a real order through the public storefront API. */
export async function placeOrder(
  run: string,
  quantity = 2,
): Promise<{ number: string; title: string }> {
  const RUN = `${run}${Math.random().toString(36).slice(2, 7)}`;
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email: "owner@cartforge.test", password: "CartForge!dev1" }),
  });
  const cookies = login.headers.getSetCookie().map((c) => c.split(";")[0]!);
  const csrf = cookies.find((c) => c.startsWith("cf_csrf="))!.split("=")[1]!;
  const admin = (method: string, path: string, body?: unknown) =>
    fetch(`${API}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        cookie: cookies.join("; "),
        "x-csrf-token": csrf,
        "x-store-id": STORE,
        origin: ORIGIN,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(json);
  const title = `Order Lamp ${RUN}`;
  const product: { variants: { id: string }[] } = await admin("POST", "/products", {
    title,
    price_minor: 4200,
    status: "active",
    inventory_quantity: 5,
  });
  const settings: Record<string, unknown> = await admin("GET", "/settings/checkout");
  await admin("PUT", "/settings/checkout", {
    ...settings,
    cod_enabled: true,
    tax_rate_bps: 0,
    terms_required: false,
    custom_fields: [],
  });
  const ship: { id: string } = await admin("POST", "/shipping-methods", {
    name: `Admin test ship ${RUN}`,
    price_minor: 0,
    countries: ["GB"],
  });

  const shop = (
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    extra: Record<string, string> = {},
  ) =>
    fetch(`${API}/storefront${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-store-id": STORE,
        ...(token && { "x-cart-token": token }),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(json);
  const { token }: { token: string } = await shop("POST", "/cart");
  await shop("POST", "/cart/lines", token, { variant_id: product.variants[0]!.id, quantity });
  await shop("POST", "/checkout", token);
  await shop("PATCH", "/checkout", token, {
    email: `buyer-${RUN}@example.com`,
    shipping_address: {
      first_name: "Grace",
      last_name: "Hopper",
      address1: "10 Downing St",
      city: "London",
      postal_code: "SW1A 2AA",
      country: "GB",
    },
    shipping_method_id: ship.id,
    payment_method: "cod",
  });
  const order: { number: string } = await shop(
    "POST",
    "/checkout/complete",
    token,
    {},
    { "idempotency-key": RUN },
  );
  await admin("DELETE", `/shipping-methods/${ship.id}`).catch(() => undefined);
  return { number: order.number, title };
}
