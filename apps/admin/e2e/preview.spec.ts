import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const RUN = Date.now().toString(36);

/** Next 2: staff can see a draft on the storefront before publishing it. */
test("Preview opens the draft on the storefront in a new tab", async ({ page, context }) => {
  test.skip(!process.env.STOREFRONT_URL, "needs the storefront (STOREFRONT_URL)");
  await signIn(page, "catalog@cartforge.test");
  await page.goto("/admin/products/new");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(`Preview draft ${RUN}`);
  await page.getByRole("button", { name: "Save product" }).click();
  await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/);

  const [tab] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: "Preview" }).click(),
  ]);
  await tab.waitForURL(/\/preview\/products\/[0-9a-f-]{36}\?token=/);
  await expect(tab.getByRole("status")).toContainText("Draft — not visible to customers");
  await expect(tab.getByRole("heading", { level: 1, name: `Preview draft ${RUN}` })).toBeVisible();
});
