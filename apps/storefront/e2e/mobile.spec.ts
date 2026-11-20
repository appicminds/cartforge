import { expect, test } from "@playwright/test";

/** Phone layout (PRD FE-010): no sideways scrolling; menu and search reachable. */
test.describe("storefront on a phone", () => {
  for (const path of ["/", "/products", "/collections", "/search?q=a"]) {
    test(`${path} fits the screen`, async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("menu opens and navigates", async ({ page }) => {
    await page.goto("/");
    await page.locator("summary", { hasText: "Menu" }).click();
    const nav = page.getByRole("navigation", { name: "Mobile" });
    await expect(nav).toBeVisible();
    await nav.getByRole("link", { name: "Shop all" }).click();
    await expect(page).toHaveURL(/\/products$/);
    await expect(page.getByRole("heading", { level: 1, name: "All products" })).toBeVisible();
  });
});
