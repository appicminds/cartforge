import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";
import { placeOrder } from "./order-helpers";

/** Next 7 — the customer list and a customer's page in the admin. */
const RUN = `cust${Date.now().toString(36)}`;

test("orders create customers that staff can find, tag and open", async ({ page }) => {
  const order = await placeOrder(RUN, 1);
  await signIn(page, "admin@cartforge.test");
  await page.getByRole("link", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search customers" }).fill(`buyer-${RUN}`);
  const row = page.getByRole("row").filter({ hasText: `buyer-${RUN}` });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Grace Hopper");
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(scan.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);

  await row.getByRole("link", { name: "Grace Hopper" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Grace Hopper/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Orders" })).toContainText(`#${order.number}`);
  await page.getByLabel("Note").fill("Called about delivery time");
  await page.getByLabel("Tags").fill(`vip-${RUN}, wholesale`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Customer saved")).toBeVisible();
  const detailScan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(detailScan.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);

  await page.getByRole("link", { name: "Back to customers" }).click();
  await page.getByRole("searchbox", { name: "Search customers" }).fill(`vip-${RUN}`);
  await expect(page.getByRole("row").filter({ hasText: `buyer-${RUN}` })).toHaveCount(1);
});

test("catalog managers don't see customers", async ({ page }) => {
  await signIn(page, "catalog@cartforge.test");
  await expect(page.getByRole("link", { name: "Customers" })).toHaveCount(0);
});
