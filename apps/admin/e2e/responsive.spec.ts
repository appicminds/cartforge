import { expect, test } from "@playwright/test";
import { expectStore, signIn } from "./helpers";

test("mobile: navigation drawer opens and closes", async ({ page }) => {
  await signIn(page, "admin@cartforge.test");
  await expectStore(page, "Northwind Goods");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  // No horizontal page scroll at phone width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
