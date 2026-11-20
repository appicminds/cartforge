import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/** Next 4 — orders placed on the storefront show up in the admin; checkout settings are editable. */
const API = "http://localhost:4000/api/v1";
const ORIGIN = "http://localhost:3000";
const STORE = "00000000-0000-4000-8000-000000000001";
const RUN = `ord${Date.now().toString(36)}`;

async function json(res: Response) {
  const body = (await res.json()) as { data: never; error?: unknown };
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body.error)}`);
  return body.data;
}

/** Places a real order through the public storefront API. */
async function placeOrder(): Promise<{ number: string; title: string }> {
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
  await shop("POST", "/cart/lines", token, { variant_id: product.variants[0]!.id, quantity: 2 });
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

test("orders from the storefront appear with full detail", async ({ page }) => {
  const order = await placeOrder();
  await signIn(page, "admin@cartforge.test");
  await page.getByRole("link", { name: "Orders" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search orders" }).fill(order.number);
  const link = page.getByRole("link", { name: `#${order.number}` });
  await expect(link).toBeVisible();
  const row = page.getByRole("row").filter({ has: link });
  await expect(row).toContainText("Grace Hopper");
  await expect(row).toContainText("Payment pending");
  await expect(row).toContainText("$84.00");
  await link.click();

  await expect(
    page.getByRole("heading", { level: 1, name: `Order #${order.number}` }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: order.title })).toBeVisible();
  await expect(page.getByText("$42.00 × 2")).toBeVisible();
  await expect(page.getByText("10 Downing St").first()).toBeVisible();
  await expect(page.getByText(/Order placed on the storefront/)).toBeVisible();
  await expect(page.getByText("Cash on delivery", { exact: true })).toBeVisible();
});

test("roles without order access don't see orders", async ({ page }) => {
  await signIn(page, "catalog@cartforge.test");
  await expect(page.getByRole("link", { name: "Orders" })).toHaveCount(0);
});

test("checkout settings: shipping methods and payment toggles", async ({ page }) => {
  await signIn(page, "admin@cartforge.test");
  await page.goto("/admin/settings/checkout");
  await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();

  // Add a shipping method, with client-side validation first.
  await page.getByRole("button", { name: "Add method" }).click();
  const dialog = page.getByRole("dialog", { name: "Add shipping method" });
  await dialog.getByLabel("Name").fill(`Pigeon ${RUN}`);
  await dialog.getByLabel("Rate (USD)").fill("3.50");
  await dialog.getByLabel("Countries").fill("United States");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Use two-letter country codes like US, CA, GB")).toBeVisible();
  await dialog.getByLabel("Countries").fill("us, ca");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Shipping method added")).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: `Pigeon ${RUN}` });
  await expect(item).toContainText("$3.50 · CA, US");

  await item.getByRole("button", { name: `Delete Pigeon ${RUN}` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Shipping method deleted")).toBeVisible();
  await expect(item).toHaveCount(0);

  // Payment toggles: bank transfer needs details; saving persists.
  const bank = page.getByRole("checkbox", { name: /Bank transfer/ });
  const wasOn = await bank.isChecked();
  if (wasOn) {
    await bank.uncheck();
  } else {
    await bank.check();
    await page.getByLabel(/Bank details shown to customers/).fill(`IBAN ${RUN}`);
  }
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Checkout settings saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Bank transfer/ })).toBeChecked({
    checked: !wasOn,
  });

  // Put it back.
  const again = page.getByRole("checkbox", { name: /Bank transfer/ });
  if (wasOn) {
    await again.check();
    const details = page.getByLabel(/Bank details shown to customers/);
    if (!(await details.inputValue())) await details.fill(`IBAN ${RUN}`);
  } else await again.uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Checkout settings saved").last()).toBeVisible();
});
