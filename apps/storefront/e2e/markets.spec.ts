import { expect, test } from "@playwright/test";
import { RUN } from "./catalog-api";

/**
 * Markets: a PKR store that also sells to the Gulf in AED. The shopper picks
 * their country in the footer; prices, products, the cart and checkout follow.
 */
const API = process.env.API_URL ?? "http://localhost:4000";
const ORIGIN = (process.env.ADMIN_ORIGIN ?? "http://localhost:3000").split(",")[0]!.trim();

let handle = "";
let suit = "";
let shawl = "";

test.beforeAll(async () => {
  const login = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email: "other@cartforge.test", password: "CartForge!dev1" }),
  });
  const cookies = login.headers.getSetCookie().map((c) => c.split(";")[0]!);
  const csrf = cookies.find((c) => c.startsWith("cf_csrf="))!.split("=")[1]!;
  let storeId = "";
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${API}/api/v1${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        cookie: cookies.join("; "),
        "x-csrf-token": csrf,
        origin: ORIGIN,
        ...(storeId && { "x-store-id": storeId }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { data: T };
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
    return json.data;
  };
  const store = await call<{ store_id: string; handle: string }>("POST", "/stores", {
    store_name: `Silsila Global ${RUN}`,
    currency: "PKR",
  });
  storeId = store.store_id;
  handle = store.handle;
  const settings = await call<Record<string, unknown>>("GET", "/settings/checkout");
  await call("PUT", "/settings/checkout", { ...settings, cod_enabled: true });
  await call("POST", "/shipping-methods", { name: "Courier", price_minor: 250, countries: [] });
  const mk = async (title: string, price: number) =>
    call<{ id: string; handle: string }>("POST", "/products", {
      title: `${title} ${RUN}`,
      price_minor: price,
      status: "active",
      inventory_quantity: 10,
    });
  const s = await mk("Lawn Suit", 4799);
  const w = await mk("Pashmina Shawl", 9000);
  suit = s.handle;
  shawl = w.handle;
  await call("GET", "/markets"); // creates the primary market
  const gulf = await call<{ id: string }>("POST", "/markets", {
    name: "Gulf",
    currency: "AED",
    countries: ["AE", "SA"],
    manual_rate: 76,
    rounding: "x99",
  });
  await call("PUT", `/products/${w.id}/markets`, { hidden_market_ids: [gulf.id], prices: [] });
});

test("a shopper switches to the Gulf: AED prices, hidden products, AED checkout", async ({
  page,
}) => {
  await page.goto(`/?store=${handle}`);
  await page.goto(`/products/${suit}`);
  await expect(page.getByText(/Rs\s?4,799|PKR\s?4,799/).first()).toBeVisible();

  // Footer selector: switch to the Gulf market.
  await page.locator("#market-select").selectOption({ label: "Gulf (AED)" });
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText(/AED\s?63\.99/).first()).toBeVisible();

  // The shawl isn't sold in the Gulf: not listed, and its page says so.
  await page.goto(`/search?q=${RUN}`);
  await expect(
    page.getByRole("link", { name: new RegExp(`Lawn Suit ${RUN}`) }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`Pashmina Shawl ${RUN}`) })).toHaveCount(
    0,
  );
  await page.goto(`/products/${shawl}`);
  await expect(page.getByTestId("not-in-market")).toBeVisible();
  await expect(page.getByRole("button", { name: "Not available in your region" })).toBeDisabled();

  // Cart and checkout in AED; only the market's countries.
  await page.goto(`/products/${suit}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText(/Added to your cart/)).toBeVisible();
  await page.goto("/cart");
  await expect(page.getByText(/AED\s?63\.99/).first()).toBeVisible();
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page).toHaveURL(/\/checkout/);
  await expect(page.locator('select[name="shipping_address.country"]')).toBeVisible();
  const countries = await page
    .locator('select[name="shipping_address.country"]')
    .locator("option")
    .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  expect(countries.sort()).toEqual(["AE", "SA"]);

  // Back to Pakistan: the cart re-prices in rupees.
  await page.goto("/cart");
  await page.locator("#market-select").selectOption({ label: "Pakistan (PKR)" });
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText(/Rs\s?4,799|PKR\s?4,799/).first()).toBeVisible();
});
