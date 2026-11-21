import { expect, test } from "@playwright/test";
import { RUN } from "./catalog-api";

/** Next 8 — a shopper uses a discount code at checkout. */
const API = process.env.API_URL ?? "http://localhost:4000";
const ORIGIN = (process.env.ADMIN_ORIGIN ?? "http://localhost:3000").split(",")[0]!.trim();
let handle = "";
let suit = "";

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
    store_name: `Eid Store ${RUN}`,
    currency: "PKR",
  });
  storeId = store.store_id;
  handle = store.handle;
  const settings = await call<Record<string, unknown>>("GET", "/settings/checkout");
  await call("PUT", "/settings/checkout", { ...settings, cod_enabled: true });
  await call("POST", "/shipping-methods", { name: "Courier", price_minor: 250, countries: [] });
  suit = (
    await call<{ handle: string }>("POST", "/products", {
      title: `Lawn Suit ${RUN}`,
      price_minor: 4000,
      status: "active",
      inventory_quantity: 20,
    })
  ).handle;
  await call("POST", "/discounts", {
    title: "Eid 10%",
    method: "code",
    code: "EID10",
    kind: "order",
    value_type: "percent",
    value: 1000,
    min_subtotal_minor: 5000,
  });
});

test("a code is checked, explained until it applies, and kept on the order", async ({ page }) => {
  await page.goto(`/?store=${handle}`);
  await page.goto(`/products/${suit}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText(/Added to your cart/)).toBeVisible();
  await page.goto("/cart");
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page).toHaveURL(/\/checkout/);

  const code = page.getByRole("textbox", { name: "Discount code" });
  await code.fill("NOPE");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("This code isn't valid.")).toBeVisible();

  await code.fill("eid10");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByTestId("discount-applied")).toContainText("EID10");
  await expect(page.getByTestId("discount-applied")).toContainText(
    /Spend .*1,000 more to use EID10/,
  );
  await expect(page.getByTestId("checkout-discount")).toHaveCount(0);

  // A second suit meets the minimum.
  await page.goto(`/products/${suit}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText(/Added to your cart/)).toBeVisible();
  await page.goto("/checkout");
  await expect(page.getByTestId("checkout-discount")).toContainText("EID10");
  await expect(page.getByTestId("checkout-discount")).toContainText(/800/);

  await page.getByRole("textbox", { name: "Email", exact: true }).fill(`eid+${RUN}@example.com`);
  await page.getByLabel("Country / region").first().selectOption("PK");
  await page.getByLabel("Last name").fill("Khan");
  await page.getByLabel("Address", { exact: true }).fill("12 Mall Road");
  await page.getByLabel("City").fill("Lahore");
  await page.getByLabel("State / province").selectOption("Punjab");
  await page.getByLabel("Postal code").fill("54000");
  await page.getByRole("button", { name: "Continue to shipping" }).click();
  await page.getByLabel(/Courier/).check();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByTestId("checkout-total")).toContainText(/7,450/); // 8,000 − 800 + 250
  await page.getByRole("radio", { name: /Cash on delivery/ }).check();
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}\?key=/);
  await expect(page.getByText(/Discount · EID10/)).toBeVisible();
});
