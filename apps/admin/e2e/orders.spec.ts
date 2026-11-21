import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { placeOrder } from "./order-helpers";

/** Next 4 — orders placed on the storefront show up in the admin; checkout settings are editable. */
const RUN = `ord${Date.now().toString(36)}`;

test("orders from the storefront appear with full detail", async ({ page }) => {
  const order = await placeOrder(RUN);
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

  // Add a shipping option: the preview shows what customers will see.
  await page.getByRole("button", { name: "Add shipping option" }).click();
  const dialog = page.getByRole("dialog", { name: "Add shipping option" });
  const preview = dialog.getByTestId("shipping-preview");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Enter an amount (0 for free)")).toBeVisible();
  await dialog.getByLabel("Option name").fill(`Pigeon ${RUN}`);
  await dialog.getByLabel(/^Price/).fill("3.50");
  await dialog.getByLabel("Transit time").selectOption({ label: "3 to 5 business days" });
  await expect(preview).toContainText(`Pigeon ${RUN}`);
  await expect(preview).toContainText("3 to 5 business days");
  await expect(preview).toContainText("$3.50");
  await dialog.getByLabel("Ships to").selectOption("several");
  await dialog.getByLabel("Countries").fill("United States");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Use two-letter country codes like PK, AE")).toBeVisible();
  await dialog.getByLabel("Countries").fill("us, ca");
  await dialog.getByRole("switch", { name: "Offer free shipping" }).click();
  await dialog.getByLabel("Minimum order amount").fill("50");
  await expect(preview).toContainText("Free over $50.00");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Shipping option added")).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: `Pigeon ${RUN}` });
  await expect(item).toContainText("$3.50 · free over $50.00 · CA, US");

  // Limits: provinces need one country; delivery days come from the transit time.
  await item.getByRole("button", { name: `Edit Pigeon ${RUN}` }).click();
  const edit = page.getByRole("dialog", { name: "Edit shipping option" });
  await edit.getByRole("button", { name: "Limit to provinces, cities or order amount" }).click();
  await edit.getByLabel("Only these provinces / states").fill("Ontario, Quebec");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit.getByText("Choose one country under Ships to first")).toBeVisible();
  await edit.getByLabel("Ships to").selectOption("CA");
  await edit.getByLabel("Only these cities").fill("Toronto");
  await edit.getByLabel("Extra per additional item").fill("1");
  await edit.getByLabel("Orders from").fill("20");
  await edit.getByLabel("Transit time").selectOption("custom");
  await edit.getByLabel("From (days)").fill("4");
  await edit.getByLabel("To (days)").fill("2");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit.getByText("Must be at least the first number")).toBeVisible();
  await edit.getByLabel("To (days)").fill("6");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Shipping option saved")).toBeVisible();
  await expect(item).toContainText(
    "$3.50 · free over $50.00 · CA (Ontario, Quebec) · Toronto · +$1.00 per extra item · orders from $20.00 · 4 to 6 business days",
  );

  await item.getByRole("button", { name: `Delete Pigeon ${RUN}` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Shipping method deleted")).toBeVisible();
  await expect(item).toHaveCount(0);

  // Payment toggles (Settings → Payments): bank transfer needs details; saving persists.
  await page.goto("/admin/settings/payments");
  const bank = page.getByRole("checkbox", { name: /Bank transfer/ });
  const wasOn = await bank.isChecked();
  if (wasOn) {
    await bank.uncheck();
  } else {
    await bank.check();
    await page.getByLabel(/Bank details shown to customers/).fill(`IBAN ${RUN}`);
  }
  await page.getByRole("button", { name: "Save payment methods" }).click();
  await expect(page.getByText("Payment methods saved")).toBeVisible();
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
  await page.getByRole("button", { name: "Save payment methods" }).click();
  await expect(page.getByText("Payment methods saved").last()).toBeVisible();

  // Regional tax: a province rule, saved and shown after reload, then removed.
  await page.goto("/admin/settings/checkout");
  await page.getByRole("button", { name: "Add rate" }).click();
  const rule = page.getByRole("list", { name: "Tax rules" }).getByRole("listitem").last();
  await rule.getByLabel("Country").fill("pk");
  await rule.getByLabel("Rate (%)").fill("140");
  await expect(rule.getByText("0–100")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
  await rule.getByLabel("Rate (%)").fill("16");
  await rule.getByLabel("Province / state").fill("Punjab");
  await rule.getByLabel("Label").fill("PST");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Checkout settings saved").last()).toBeVisible();
  await page.reload();
  const saved = page.getByRole("list", { name: "Tax rules" }).getByRole("listitem").last();
  await expect(saved.getByLabel("Country")).toHaveValue("PK");
  await expect(saved.getByLabel("Province / state")).toHaveValue("Punjab");
  await expect(saved.getByLabel("Rate (%)")).toHaveValue("16");
  await saved.getByRole("button", { name: "Remove tax rule for Punjab, PK" }).click();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Checkout settings saved").last()).toBeVisible();
});
