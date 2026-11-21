import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

const RUN = Date.now().toString(36).toUpperCase();

async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    label,
  ).toEqual([]);
}

/** Next 8 — create a code and an automatic free-shipping discount, then switch one off. */
test("create, list and switch off discounts", async ({ page }) => {
  await signIn(page, "admin@cartforge.test");
  await page.getByRole("link", { name: "Discounts" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Discounts" })).toBeVisible();
  await page.getByRole("link", { name: "Create discount" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Create discount" })).toBeVisible();

  // Amount off order, code, 15% with a minimum purchase.
  await page.getByRole("radio", { name: /Amount off order/ }).click();
  await page.getByRole("textbox", { name: "Discount code" }).fill(`sale${RUN}`);
  await expect(page.getByRole("textbox", { name: "Discount code" })).toHaveValue(`SALE${RUN}`);
  await page.getByRole("button", { name: "Create discount" }).click();
  await expect(page.getByText("Enter a percentage between 0 and 100")).toBeVisible();
  await page.getByLabel(/^Percentage off/).fill("15");
  await page.getByRole("radio", { name: /Minimum purchase amount/ }).check();
  await page.getByRole("textbox", { name: "Minimum purchase amount" }).fill("50");
  const summary = page.getByTestId("discount-summary");
  await expect(summary).toContainText("15% off the order");
  await expect(summary).toContainText("Minimum purchase $50.00");
  await scan(page, "discount editor");
  await page.getByRole("button", { name: "Create discount" }).click();
  await expect(page.getByText("Discount created")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/discounts\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: `SALE${RUN}` })).toBeVisible();

  // Same code again is refused.
  await page.goto("/admin/discounts/new");
  await page.getByRole("textbox", { name: "Discount code" }).fill(`SALE${RUN}`);
  await page.getByLabel(/^Percentage off/).fill("5");
  await page.getByRole("button", { name: "Create discount" }).click();
  await expect(page.getByText("Another discount uses this code")).toBeVisible();

  // Automatic free shipping.
  await page.goto("/admin/discounts/new");
  await page.getByRole("radio", { name: /Free shipping/ }).click();
  await page.getByRole("radio", { name: "Automatic discount" }).check();
  await page.getByLabel(/^Title/).fill(`Free delivery ${RUN}`);
  await page.getByRole("button", { name: "Create discount" }).click();
  await expect(page.getByText("Discount created")).toBeVisible();

  // The list shows both; switching one off.
  await page.getByRole("link", { name: "Discounts" }).first().click();
  await page.getByRole("searchbox", { name: "Search discounts" }).fill(RUN);
  const rows = page.getByRole("row");
  await expect(rows.filter({ hasText: `SALE${RUN}` })).toContainText("Active");
  await expect(rows.filter({ hasText: `Free delivery ${RUN}` })).toContainText("Automatic");
  await scan(page, "discounts list");
  await page.getByRole("link", { name: `SALE${RUN}` }).click();
  await page.getByRole("checkbox", { name: /^Active/ }).uncheck();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Discount saved")).toBeVisible();
  await page.goto("/admin/discounts");
  await page.getByRole("searchbox", { name: "Search discounts" }).fill(`SALE${RUN}`);
  await expect(page.getByRole("row").filter({ hasText: `SALE${RUN}` })).toContainText("Off");

  // Leave the shared demo store without an automatic discount (other tests price its checkout).
  await page.getByRole("searchbox", { name: "Search discounts" }).fill(`Free delivery ${RUN}`);
  await page.getByRole("link", { name: `Free delivery ${RUN}` }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Discount deleted")).toBeVisible();
});
