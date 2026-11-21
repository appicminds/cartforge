import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { CatalogApi, RUN } from "./catalog-api";

/**
 * Next 4 — a shopper buys through the real storefront: cart, three checkout
 * steps, order confirmation (PRD §13). Totals shown are the server's.
 */
let api: CatalogApi;
let courier: string;

test.beforeAll(async () => {
  api = await CatalogApi.login();
  const current = await api.call<Record<string, unknown>>("GET", "/settings/checkout");
  await api.call("PUT", "/settings/checkout", {
    ...current,
    tax_rate_bps: 1000,
    tax_label: "Sales tax",
    prices_include_tax: false,
    tax_shipping: false,
    phone: "optional",
    terms_required: true,
    terms_label: "I accept the terms of sale",
    terms_url: "",
    custom_fields: [
      {
        key: "delivery",
        label: "Delivery window",
        type: "select",
        required: true,
        options: ["Morning", "Evening"],
        help: "",
      },
    ],
    cod_enabled: true,
    cod_instructions: "Pay the courier in cash.",
    bank_transfer_enabled: true,
    bank_transfer_instructions: "IBAN TEST 0000",
  });
  courier = `Courier ${RUN}`;
  await api.post("/shipping-methods", { name: courier, price_minor: 700, countries: ["US"] });
});

async function addToCart(page: Page, handle: string, qty = 1) {
  await page.goto(`/products/${handle}`);
  if (qty > 1) await page.getByRole("spinbutton", { name: "Quantity" }).fill(String(qty));
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText(/Added to your cart|available/)).toBeVisible();
}

async function fillInformation(page: Page) {
  await page.getByLabel("Email").fill(`shopper+${RUN}@example.com`);
  await page.getByLabel("Country / region").selectOption("US");
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Address", { exact: true }).fill("1 Analytical Way");
  await page.getByLabel("City").fill("Springfield");
  await page.getByLabel("State / province").fill("IL");
  await page.getByLabel("Postal code").fill("62701");
}

test("guest checkout from product page to order confirmation", async ({ page }) => {
  const p = await api.post<{ id: string; handle: string; variants: { id: string }[] }>(
    "/products",
    {
      title: `Field Lantern ${RUN}`,
      price_minor: 3000,
      status: "active",
      inventory_quantity: 3,
    },
  );

  await addToCart(page, p.handle, 2);
  await expect(page.getByTestId("cart-count")).toHaveText("2");

  await page.getByRole("link", { name: "View cart and check out" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your cart" })).toBeVisible();
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$60.00");
  const more = page.getByRole("button", { name: `Increase quantity of Field Lantern ${RUN}` });
  await more.click();
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$90.00");
  await expect(more).toBeDisabled(); // all 3 in stock are in the cart

  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText(/We’re holding your items until/)).toBeVisible();

  // Server-side validation comes back onto the fields.
  await page.getByRole("button", { name: "Continue to shipping" }).click();
  await expect(page.getByText("Please check the highlighted fields.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");

  await fillInformation(page);
  await page.getByRole("button", { name: "Continue to shipping" }).click();
  await expect(page).toHaveURL(/step=shipping/);
  await page.getByLabel(new RegExp(courier)).check();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page).toHaveURL(/step=payment/);

  // 90.00 + 7.00 shipping + 10% tax on goods (9.00) = 106.00
  await expect(page.getByTestId("checkout-total")).toContainText("$106.00");
  await page.getByLabel("Cash on delivery").check();
  await page.getByRole("button", { name: /Place order · \$106\.00/ }).click();
  await expect(
    page
      .getByText("Please check the highlighted fields.")
      .or(page.getByText(/Accept the terms|required/i))
      .first(),
  ).toBeVisible();

  await page.getByLabel("Delivery window").selectOption("Evening");
  await page.getByLabel(/I accept the terms of sale/).check();
  await page.getByRole("button", { name: /Place order/ }).click();

  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}\?key=/);
  const orderUrl = page.url();
  await expect(page.getByRole("heading", { level: 1, name: "Thank you, Ada!" })).toBeVisible();
  await expect(page.getByTestId("order-status")).toContainText("Confirmed");
  await expect(page.getByText(/Cash on delivery · Awaiting payment/)).toBeVisible();
  await expect(page.getByTestId("payment-instructions")).toHaveText("Pay the courier in cash.");
  await expect(page.getByText("$106.00").first()).toBeVisible();
  await expect(page.getByTestId("cart-count")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  // Stock left the warehouse: the product is now sold out.
  await page.goto(`/products/${p.handle}`);
  await expect(page.getByRole("button", { name: "Sold out" })).toBeDisabled();

  // Next 6: the store ships it; the customer's page shows tracking.
  const orderId = new URL(orderUrl).pathname.split("/").pop()!;
  await api.post(`/orders/${orderId}/fulfillments`, {
    tracking_company: "DHL",
    tracking_number: "JD0042",
    tracking_url: "https://track.example/JD0042",
    notify_customer: false,
  });
  await page.goto(orderUrl);
  const status = page.getByTestId("order-status");
  await expect(status.getByRole("heading", { name: "Shipped" })).toBeVisible();
  await expect(status).toContainText("DHL JD0042");
  await expect(status.getByRole("link", { name: "Track your package" })).toHaveAttribute(
    "href",
    "https://track.example/JD0042",
  );
  // Cash on delivery is still unpaid, so the payment instructions stay.
  await expect(page.getByTestId("payment-instructions")).toBeVisible();
});

test("cart reports price changes and sold-out items", async ({ page }) => {
  const a = await api.post<{ id: string; handle: string }>("/products", {
    title: `Repricing Mug ${RUN}`,
    price_minor: 1500,
    status: "active",
    inventory_quantity: 5,
  });
  const b = await api.post<{ id: string; handle: string; variants: { id: string }[] }>(
    "/products",
    {
      title: `Vanishing Vase ${RUN}`,
      price_minor: 2000,
      status: "active",
      inventory_quantity: 1,
    },
  );
  await addToCart(page, a.handle);
  await addToCart(page, b.handle);
  await api.patch(`/products/${a.id}`, { price_minor: 1800 });
  await api.post("/inventory/adjustments", {
    variant_id: b.variants[0]!.id,
    mode: "set",
    quantity: 0,
    reason: "damaged",
  });
  await page.goto("/cart");
  const notices = page.getByRole("status").filter({ hasText: "Your cart was updated" });
  await expect(notices).toContainText("changed from $15.00 to $18.00");
  await expect(notices).toContainText(`Vanishing Vase ${RUN} just sold out`);
  await expect(page.getByRole("button", { name: "Check out" })).toBeDisabled();
  await page.getByRole("button", { name: `Remove Vanishing Vase ${RUN}` }).click();
  await expect(page.getByRole("button", { name: "Check out" })).toBeEnabled();
  await expect(page.getByTestId("cart-subtotal")).toHaveText("$18.00");
});

test("order pages need their private key", async ({ page }) => {
  const res = await page.goto("/orders/00000000-0000-4000-8000-000000000999?key=nope");
  expect(res?.status()).toBe(404);
  const bare = await page.goto("/orders/00000000-0000-4000-8000-000000000999");
  expect(bare?.status()).toBe(404);
});

test("cart and checkout meet WCAG 2.1 AA", async ({ page }) => {
  const p = await api.post<{ handle: string }>("/products", {
    title: `Axe Basket ${RUN}`,
    price_minor: 2500,
    status: "active",
    inventory_quantity: 5,
  });
  const scan = async () => {
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
  };
  await page.goto("/cart");
  await scan(); // empty cart
  await addToCart(page, p.handle);
  await page.goto("/cart");
  await scan();
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await scan();
  await page.getByRole("button", { name: "Continue to shipping" }).click();
  await expect(page.getByText("Please check the highlighted fields.")).toBeVisible();
  await scan(); // with errors
  await fillInformation(page);
  await page.getByRole("button", { name: "Continue to shipping" }).click();
  await expect(page).toHaveURL(/step=shipping/);
  await scan();
  await page.getByLabel(new RegExp(courier)).check();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page).toHaveURL(/step=payment/);
  await scan();
});
