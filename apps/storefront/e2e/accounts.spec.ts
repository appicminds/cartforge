import { expect, test, type Page } from "@playwright/test";
import { RUN } from "./catalog-api";

/**
 * Next 7 — customer accounts: sign up, save an address, check out with it
 * prefilled, and find the order under the account after signing back in.
 */
const API = process.env.API_URL ?? "http://localhost:4000";
const ORIGIN = (process.env.ADMIN_ORIGIN ?? "http://localhost:3000").split(",")[0]!.trim();
const EMAIL = `sana+${RUN}@example.com`;
const PASSWORD = "Saffron-Lane-2026";

let handle = "";
let productHandle = "";

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
    store_name: `Saffron Lane ${RUN}`,
    currency: "PKR",
  });
  storeId = store.store_id;
  handle = store.handle;
  await call("PUT", "/settings/checkout", {
    tax_rate_bps: 0,
    prices_include_tax: false,
    tax_shipping: false,
    phone: "optional",
    reservation_minutes: 15,
    terms_required: false,
    custom_fields: [],
    cod_enabled: true,
    cod_instructions: "",
    bank_transfer_enabled: false,
    bank_transfer_instructions: "",
  });
  await call("POST", "/shipping-methods", { name: "Leopards", price_minor: 200, countries: [] });
  productHandle = (
    await call<{ handle: string }>("POST", "/products", {
      title: `Shawl ${RUN}`,
      price_minor: 3000,
      status: "active",
      inventory_quantity: 10,
    })
  ).handle;
});

async function signIn(page: Page) {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/account\/login/);
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Sana" })).toBeVisible();
}

test("sign up, save an address, check out with it, see the order in the account", async ({
  page,
}) => {
  await page.goto(`/?store=${handle}`);
  await page.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/account\/login/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("First name").fill("Sana");
  await page.getByLabel("Last name").fill("Malik");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Sana" })).toBeVisible();
  await expect(page.getByText("No orders yet.")).toBeVisible();

  // Save an address; the first one becomes the default.
  await page.getByRole("link", { name: "Add an address" }).click();
  await page.getByLabel("Country / region").selectOption("PK");
  await page.getByLabel("First name").fill("Sana");
  await page.getByLabel("Last name").fill("Malik");
  await page.getByLabel("Address", { exact: true }).fill("7 Saffron Lane");
  await page.getByLabel("City").fill("Karachi");
  const region = page.getByLabel("State / province");
  if (await region.count()) await region.fill("Sindh");
  await page.getByLabel("Postal code").fill("75500");
  await page.getByRole("button", { name: "Save address" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("link", { name: "Edit 7 Saffron Lane" })).toBeVisible();
  await expect(page.getByText("Default", { exact: true })).toBeVisible();

  // Checkout: contact and address come from the account.
  await page.goto(`/products/${productHandle}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText(/Added to your cart/)).toBeVisible();
  await page.goto("/cart");
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(EMAIL);
  await expect(page.getByLabel("Address", { exact: true })).toHaveValue("7 Saffron Lane");
  await expect(page.getByText("Have an account?")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue to shipping" }).click();
  await page.getByLabel(/Leopards/).check();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("radio", { name: /Cash on delivery/ }).check();
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}\?key=/);

  // Sign out and back in: the order is in the account.
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$|\/\?/);
  await signIn(page);
  const order = page.getByRole("link", { name: /^Order #\d+/ });
  await expect(order).toHaveCount(1);
  await order.click();
  await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/Shawl/).first()).toBeVisible();
});

test("a wrong password is refused without revealing whether the account exists", async ({
  page,
}) => {
  await page.goto(`/?store=${handle}`);
  await page.goto("/account/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(EMAIL);
  await page.getByLabel("Password").fill("not-the-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toHaveValue(EMAIL);
});

test("forgot password always answers the same", async ({ page }) => {
  await page.goto(`/?store=${handle}`);
  await page.goto("/account/forgot");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(`nobody+${RUN}@example.com`);
  await page.getByRole("button", { name: "Send link" }).click();
  await expect(page.getByRole("status")).toContainText(/link/i);
});
