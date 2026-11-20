import { expect, test } from "@playwright/test";

/**
 * P1 — each store is served on its own address. Chromium resolves *.localhost to
 * loopback, so seeded stores answer at <handle>.shops.localhost (PLATFORM_DOMAIN).
 */
const NORTHWIND = "Northwind Goods";
const HARBOR = "Harbor Outfitters";
const PORT = Number(process.env.STOREFRONT_PORT ?? 3100);
const at = (handle: string) => `http://${handle}.shops.localhost:${PORT}`;

test.skip(
  process.env.PLATFORM_DOMAIN !== "shops.localhost",
  "needs PLATFORM_DOMAIN=shops.localhost",
);

test("each store subdomain shows that store only", async ({ page }) => {
  await page.goto(at("northwind"));
  await expect(page.getByRole("banner")).toContainText(NORTHWIND);
  await page.goto(at("harbor"));
  await expect(page.getByRole("banner")).toContainText(HARBOR);
  await expect(page.getByRole("banner")).not.toContainText(NORTHWIND);
});

test("an unknown subdomain is a 404, not another store", async ({ page }) => {
  const res = await page.goto(at("no-such-store"));
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This store isn’t available" })).toBeVisible();
  await expect(page.getByText(NORTHWIND)).toHaveCount(0);
});
