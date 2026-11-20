import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

const RUN = Date.now().toString(36);

/** Platform admin moves a store's products into another store from "All stores". */
async function apiCall(page: Page, method: string, path: string, body: object, store?: string) {
  const csrf = (await page.context().cookies()).find((c) => c.name === "cf_csrf")!.value;
  const res = await page.request.fetch(`/api/v1${path}`, {
    method,
    data: body,
    headers: { "X-CSRF-Token": csrf, ...(store ? { "X-Store-Id": store } : {}) },
  });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
  return (await res.json()).data;
}

test("a platform admin moves every product to another store", async ({ page, browser }) => {
  // A merchant owns both stores (the platform admin owns none).
  const ctx = await browser.newContext();
  const merchant = await ctx.newPage();
  await signIn(merchant, "other@cartforge.test");
  const from = await apiCall(merchant, "POST", "/stores", {
    store_name: `Old Shop ${RUN}`,
    currency: "EUR",
  });
  const to = await apiCall(merchant, "POST", "/stores", {
    store_name: `New Shop ${RUN}`,
    currency: "USD",
  });
  for (const t of ["Lamp", "Vase"])
    await apiCall(
      merchant,
      "POST",
      "/products",
      { title: `${t} ${RUN}`, price_minor: 4800, status: "active" },
      from.store_id,
    );

  await ctx.close();

  await signIn(page, "platform@cartforge.test");
  await expect(page).toHaveURL(/\/admin\/platform\/stores$/);
  await page.getByRole("searchbox", { name: "Search stores" }).fill(`Old Shop ${RUN}`);
  await page.getByRole("button", { name: `Move products from Old Shop ${RUN}` }).click();
  const dialog = page.getByRole("dialog", { name: `Move products from Old Shop ${RUN}` });
  await dialog
    .getByLabel("Send products to")
    .selectOption({ label: `New Shop ${RUN} (${to.handle}, USD)` });
  await expect(dialog.getByLabel(/Price rate \(EUR → USD\)/)).toHaveValue("1");
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(scan.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);

  await dialog.getByRole("button", { name: "Move products" }).click();
  await expect(dialog.getByText("All products are in the new store")).toBeVisible();
  await expect(dialog.getByText(/^2 copied/)).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  // The old store no longer has active products; the new one has both, same numbers.
  await page.getByRole("searchbox", { name: "Search stores" }).fill(RUN);
  await expect(page.getByRole("row").filter({ hasText: `New Shop ${RUN}` })).toContainText("2");
});
