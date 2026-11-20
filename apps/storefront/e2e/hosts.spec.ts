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

test.describe("previewing a store without a domain", () => {
  const banner = (page: import("@playwright/test").Page) => page.getByTestId("preview-bar");

  test("?store=<handle> shows that store on the shared address until exited", async ({
    page,
    context,
  }) => {
    // A cart belongs to one store: starting a preview drops it.
    await context.addCookies([
      { name: "cf_cart", value: "old-cart", url: `http://localhost:${PORT}` },
    ]);
    await page.goto(`http://localhost:${PORT}/?store=harbor`);
    await expect(page).toHaveURL(`http://localhost:${PORT}/`);
    await expect(banner(page)).toContainText(`Previewing ${HARBOR}`);
    await expect(page.getByRole("banner")).toContainText(HARBOR);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect((await context.cookies()).some((c) => c.name === "cf_cart")).toBe(false);

    // The choice sticks while browsing.
    await page.goto(`http://localhost:${PORT}/products`);
    await expect(banner(page)).toContainText(HARBOR);

    await banner(page).getByRole("link", { name: "Exit preview" }).click();
    await expect(page).toHaveURL(`http://localhost:${PORT}/`);
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByRole("banner")).toContainText(NORTHWIND);
  });

  test("unknown handles and stores' own domains ignore the preview", async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/?store=no-such-store`);
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByRole("banner")).toContainText(NORTHWIND);

    await page.goto(`${at("harbor")}/?store=northwind`);
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByRole("banner")).toContainText(HARBOR);
  });
});
