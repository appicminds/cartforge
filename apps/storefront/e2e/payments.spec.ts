import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { RUN } from "./catalog-api";

/**
 * Next 5 — paying online in a Pakistani store. Playwright stands in for JazzCash:
 * it catches the form post to JazzCash's sandbox and answers like JazzCash, with a
 * correctly signed result posted back to the store's return address.
 */
const API = process.env.API_URL ?? "http://localhost:4000";
const ORIGIN = (process.env.ADMIN_ORIGIN ?? "http://localhost:3000").split(",")[0]!.trim();
const SALT = "e2e-integrity-salt";
const JAZZCASH =
  "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";

/** pp_SecureHash as JazzCash computes it (HMAC-SHA256, salt-keyed, sorted non-empty values). */
function jazzcashHash(fields: Record<string, string>) {
  const values = Object.keys(fields)
    .filter((k) => (k.startsWith("pp_") || k.startsWith("ppmpf_")) && k !== "pp_SecureHash")
    .sort()
    .map((k) => fields[k]!)
    .filter((v) => v !== "");
  return createHmac("sha256", SALT)
    .update([SALT, ...values].join("&"))
    .digest("hex")
    .toUpperCase();
}

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
    store_name: `Lahore Looms ${RUN}`,
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
    cod_enabled: false,
    cod_instructions: "",
    bank_transfer_enabled: false,
    bank_transfer_instructions: "",
    wallet_enabled: true,
    wallet_easypaisa: "03451234567",
    wallet_account_title: "Lahore Looms",
  });
  await call("POST", "/shipping-methods", { name: "TCS", price_minor: 250, countries: [] });
  productHandle = (
    await call<{ handle: string }>("POST", "/products", {
      title: `Lawn Suit ${RUN}`,
      price_minor: 4500,
      status: "active",
      inventory_quantity: 10,
    })
  ).handle;
  await call("PUT", "/payments/accounts/jazzcash", {
    mode: "test",
    enabled: true,
    credentials: { merchant_id: "MC-E2E", password: "pw", integrity_salt: SALT },
  });
});

async function checkoutWith(page: Page, method: RegExp) {
  await page.goto(`/?store=${handle}`);
  await page.goto(`/products/${productHandle}`);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText(/Added to your cart/)).toBeVisible();
  await page.goto("/cart");
  await page.getByRole("button", { name: "Check out" }).click();
  await page.getByLabel("Email").fill(`ayesha+${RUN}@example.com`);
  await page.getByLabel("Country / region").selectOption("PK");
  await page.getByLabel("First name").fill("Ayesha");
  await page.getByLabel("Last name").fill("Khan");
  await page.getByLabel("Address", { exact: true }).fill("12 Mall Road");
  await page.getByLabel("City").fill("Lahore");
  const region = page.getByLabel("State / province");
  if (await region.count()) await region.fill("Punjab");
  await page.getByLabel("Postal code").fill("54000");
  await page.getByRole("button", { name: "Continue to shipping" }).click();
  await page.getByLabel(/TCS/).check();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("radio", { name: method }).check();
  await page.getByRole("button", { name: /Place order/ }).click();
}

test("pay with JazzCash: off to JazzCash, back with a signed result, order paid", async ({
  page,
}) => {
  // Stand-in for JazzCash's hosted page.
  await page.route(JAZZCASH, async (route) => {
    const sent = Object.fromEntries(new URLSearchParams(route.request().postData() ?? ""));
    expect(sent.pp_SecureHash).toBe(jazzcashHash(sent)); // the store signed its request
    expect(sent.pp_Amount).toBe("475000"); // Rs 4,750 in paisa
    const back: Record<string, string> = {
      pp_TxnRefNo: sent.pp_TxnRefNo!,
      pp_Amount: sent.pp_Amount!,
      pp_TxnCurrency: "PKR",
      pp_ResponseCode: "000",
      pp_ResponseMessage: "Thank you for Using JazzCash, your transaction was successful.",
    };
    back.pp_SecureHash = jazzcashHash(back);
    const inputs = Object.entries(back)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`)
      .join("");
    await route.fulfill({
      contentType: "text/html",
      body: `<form id="f" method="post" action="${sent.pp_ReturnURL}">${inputs}</form><script>document.getElementById("f").submit()</script>`,
    });
  });
  await checkoutWith(page, /^JazzCash Pay with/);
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}\?key=.*payment=paid/);
  const status = page.getByTestId("order-status");
  await expect(status.getByRole("heading", { name: "Preparing your order" })).toBeVisible();
  await expect(page.getByText(/JazzCash · Paid/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Pay now" })).toHaveCount(0);
});

test("a declined JazzCash payment can be retried from the order page", async ({ page }) => {
  let attempt = 0;
  await page.route(JAZZCASH, async (route) => {
    attempt++;
    const sent = Object.fromEntries(new URLSearchParams(route.request().postData() ?? ""));
    const back: Record<string, string> =
      attempt === 1
        ? {
            pp_TxnRefNo: sent.pp_TxnRefNo!,
            pp_ResponseCode: "199",
            pp_ResponseMessage: "Insufficient balance",
          }
        : {
            pp_TxnRefNo: sent.pp_TxnRefNo!,
            pp_Amount: sent.pp_Amount!,
            pp_TxnCurrency: "PKR",
            pp_ResponseCode: "000",
            pp_ResponseMessage: "OK",
          };
    back.pp_SecureHash = jazzcashHash(back);
    const inputs = Object.entries(back)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`)
      .join("");
    await route.fulfill({
      contentType: "text/html",
      body: `<form id="f" method="post" action="${sent.pp_ReturnURL}">${inputs}</form><script>document.getElementById("f").submit()</script>`,
    });
  });
  await checkoutWith(page, /^JazzCash Pay with/);
  await expect(page).toHaveURL(/payment=failed/);
  await expect(page.getByText("Last attempt: Insufficient balance")).toBeVisible();
  await page.getByRole("link", { name: "Pay now" }).click();
  await expect(page).toHaveURL(/payment=paid/);
  await expect(page.getByText(/JazzCash · Paid/)).toBeVisible();
});

test("wallet transfer shows where to send the money", async ({ page }) => {
  await checkoutWith(page, /Easypaisa or Raast transfer/);
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}\?key=/);
  const instructions = page.getByTestId("payment-instructions");
  await expect(instructions).toContainText("• Easypaisa: 0345 1234567");
  await expect(instructions).toContainText("Account title: Lahore Looms");
});
