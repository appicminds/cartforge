import { expect, test } from "@playwright/test";

/** The public website on a phone. */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const path of ["/", "/pricing", "/legal/terms"]) {
  test(`${path} fits a phone screen`, async ({ page }) => {
    await page.goto(path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}

test("phone menu opens and navigates", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.locator("#mobile-menu").getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
});
