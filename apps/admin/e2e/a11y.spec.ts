import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * WCAG 2.1 AA scans of every admin screen (PRD §5.2, FE-007, §30).
 * Each page is scanned in its loaded state, plus key open dialogs.
 */
async function scan(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
  }));
  expect(summary, `${label}: accessibility violations`).toEqual([]);
}

async function firstProduct(page: Page) {
  await page.goto("/admin/products?sort=title&order=asc");
  await page.getByRole("row").nth(1).getByRole("link").first().click();
  await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeVisible();
}

test.describe("Accessibility (WCAG 2.1 AA)", () => {
  test("login", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in to your store" })).toBeVisible();
    await scan(page, "login");
  });

  test("home, products list, new product", async ({ page }) => {
    await signIn(page, "admin@cartforge.test");
    await expect(page.getByTestId("store-settings")).toBeVisible();
    await scan(page, "home");
    await page.goto("/admin/products");
    await expect(page.getByRole("row").nth(1)).toBeVisible();
    await scan(page, "products list");
    await page.getByRole("row").nth(1).getByRole("checkbox").check();
    await scan(page, "products list with bulk bar");
    await page.goto("/admin/products/new");
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeVisible();
    await scan(page, "new product");
  });

  test("product detail and its dialogs", async ({ page }) => {
    await signIn(page, "admin@cartforge.test");
    await firstProduct(page);
    await scan(page, "product detail");
    await page.getByRole("button", { name: "Duplicate" }).click();
    await expect(page.getByRole("dialog", { name: "Duplicate product" })).toBeVisible();
    await scan(page, "duplicate dialog");
  });

  test("inventory, categories, collections", async ({ page }) => {
    await signIn(page, "admin@cartforge.test");
    await page.goto("/admin/inventory");
    await expect(page.getByRole("row").nth(1)).toBeVisible();
    await scan(page, "inventory");
    await page
      .getByRole("button", { name: /^Adjust stock for/ })
      .first()
      .click();
    await expect(page.getByRole("dialog", { name: "Adjust stock" })).toBeVisible();
    await scan(page, "adjust stock dialog");
    await page.keyboard.press("Escape");
    await page.goto("/admin/categories");
    await expect(page.getByRole("heading", { name: "Categories", level: 1 })).toBeVisible();
    await scan(page, "categories");
    await page.goto("/admin/collections");
    await expect(page.getByRole("heading", { name: "Collections", level: 1 })).toBeVisible();
    await scan(page, "collections");
  });
});

test.describe("Responsive (no horizontal page scroll at phone width)", () => {
  test.use({ viewport: { width: 375, height: 800 } });
  for (const path of [
    "/admin",
    "/admin/products",
    "/admin/products/new",
    "/admin/inventory",
    "/admin/categories",
    "/admin/collections",
  ]) {
    test(path, async ({ page }) => {
      await signIn(page, "admin@cartforge.test");
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);
    });
  }
});
