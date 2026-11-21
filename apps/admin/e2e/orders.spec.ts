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

  // Limit to a province: needs exactly one country.
  await item.getByRole("button", { name: `Edit Pigeon ${RUN}` }).click();
  const edit = page.getByRole("dialog", { name: "Edit shipping method" });
  await edit.getByLabel("Provinces / states").fill("Ontario, Quebec");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(
    edit.getByText("Enter exactly one country above to limit by province or city"),
  ).toBeVisible();
  await edit.getByLabel("Countries").fill("CA");
  await edit.getByLabel("Cities").fill("Toronto");
  await edit.getByLabel("Extra per item (USD)").fill("1");
  await edit.getByLabel("Minimum order (USD)").fill("20");
  await edit.getByLabel("Delivery from (days)").fill("2");
  await edit.getByLabel("Delivery up to (days)").fill("1");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit.getByText("Must be at least the minimum days")).toBeVisible();
  await edit.getByLabel("Delivery up to (days)").fill("4");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Shipping method saved")).toBeVisible();
  await expect(item).toContainText(
    "$3.50 · CA (Ontario, Quebec) · Toronto · +$1.00 per extra item · orders from $20.00 · 2–4 days",
  );

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

  // Regional tax: a province rule, saved and shown after reload, then removed.
  await page.reload();
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
