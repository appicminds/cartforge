import { expect, test } from "@playwright/test";
import { CatalogApi, RUN } from "./catalog-api";

/**
 * Shopper-facing behaviour of the published catalog (PRD §11.1, §8.11 #7,
 * §29.2 #6/#8). Data is created through the admin API in each run.
 */
test.describe("storefront catalog", () => {
  let api: CatalogApi;
  const t = (s: string) => `${s} ${RUN}`;
  let cat: { id: string; handle: string };
  let col: { id: string; handle: string };
  let live: { id: string; handle: string };
  let draft: { id: string; handle: string };
  let archived: { id: string; handle: string };

  test.beforeAll(async () => {
    api = await CatalogApi.login();
    cat = await api.post("/categories", { name: t("Lamps") });
    col = await api.post("/collections", { title: t("Evening"), status: "active" });
    live = await api.post("/products", {
      title: t("Arc Lamp"),
      vendor: "Lumen",
      description_html: "<p>Warm light for <strong>reading</strong>.</p>",
      price_minor: 12900,
      compare_at_minor: 15900,
      status: "active",
      inventory_quantity: 4,
      category_ids: [cat.id],
      collection_ids: [col.id],
      seo_description: "A floor lamp with a warm, dimmable glow.",
    });
    draft = await api.post("/products", { title: t("Prototype Lamp"), price_minor: 100 });
    archived = await api.post("/products", {
      title: t("Retired Lamp"),
      price_minor: 100,
      status: "active",
    });
    await api.post(`/products/${archived.id}/archive`);
  });

  test("product page: content, price, stock, breadcrumbs and SEO", async ({ page }) => {
    await page.goto(`/products/${live.handle}`);
    await expect(page.getByRole("heading", { level: 1, name: t("Arc Lamp") })).toBeVisible();
    await expect(page.getByText("$129.00")).toBeVisible();
    await expect(page.locator("s", { hasText: "$159.00" })).toBeVisible();
    await expect(page.getByText("In stock")).toBeVisible();
    await expect(page.getByText("Warm light for")).toBeVisible();
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByRole("link", { name: t("Lamps") })).toHaveAttribute(
      "href",
      `/categories/${cat.handle}`,
    );
    await expect(page).toHaveTitle(new RegExp(t("Arc Lamp")));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`/products/${live.handle}$`),
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "A floor lamp with a warm, dimmable glow.",
    );
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const product = ld.map((s) => JSON.parse(s)).find((j) => j["@type"] === "Product");
    expect(product).toMatchObject({
      name: t("Arc Lamp"),
      brand: { name: "Lumen" },
      offers: { price: "129.00", priceCurrency: "USD", availability: "https://schema.org/InStock" },
    });
    await expect(page.getByRole("button", { name: "Add to cart" })).toBeEnabled();
  });

  test("drafts and archived products are not on the storefront", async ({ page }) => {
    for (const p of [draft, archived]) {
      const res = await page.goto(`/products/${p.handle}`);
      expect(res?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    }
    await page.goto(`/search?q=${encodeURIComponent(RUN)}`);
    await expect(page.getByRole("link", { name: t("Arc Lamp") })).toBeVisible();
    await expect(page.getByRole("link", { name: t("Prototype Lamp") })).toHaveCount(0);
    await expect(page.getByRole("link", { name: t("Retired Lamp") })).toHaveCount(0);
  });

  test("category, collection and search pages list the product", async ({ page }) => {
    await page.goto(`/categories/${cat.handle}`);
    await expect(page.getByRole("heading", { level: 1, name: t("Lamps") })).toBeVisible();
    await expect(page.getByText("1 product", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: t("Arc Lamp") }).click();
    await expect(page).toHaveURL(new RegExp(`/products/${live.handle}$`));

    await page.goto(`/collections/${col.handle}`);
    await expect(page.getByRole("link", { name: t("Arc Lamp") })).toBeVisible();

    await page.goto("/");
    const box = page.locator("#search-desktop");
    await box.fill(t("Arc Lamp"));
    await box.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByRole("link", { name: t("Arc Lamp") })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    await page.goto(`/search?q=${encodeURIComponent(`nothing-like-this-${RUN}`)}`);
    await expect(page.getByText(/No results for/)).toBeVisible();
  });

  test("admin edits show up immediately (cache purge on write)", async ({ page }) => {
    await page.goto(`/products/${live.handle}`); // warm the cache
    await api.patch(`/products/${live.id}`, { title: t("Arc Floor Lamp") });
    await page.goto(`/products/${live.handle}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("Arc Floor Lamp"));

    await api.post(`/products/${live.id}/archive`);
    expect((await page.goto(`/products/${live.handle}`))?.status()).toBe(404);
    await api.post(`/products/${live.id}/publish`);
    expect((await page.goto(`/products/${live.handle}`))?.status()).toBe(200);
  });

  test("a renamed product's old address redirects permanently", async ({ page, request }) => {
    const p = await api.post("/products", {
      title: t("Desk Lamp"),
      price_minor: 4900,
      status: "active",
    });
    const next = `desk-lamp-new-${RUN}`;
    await api.patch(`/products/${p.id}`, { handle: next, confirm_handle_change: true });
    const res = await request.get(`/products/${p.handle}`, { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toBe(`/products/${next}`);
    await page.goto(`/products/${p.handle}`);
    await expect(page).toHaveURL(new RegExp(`/products/${next}$`));
  });

  test("sitemap and robots", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain(`/products/${live.handle}</loc>`);
    expect(xml).toContain(`/categories/${cat.handle}</loc>`);
    expect(xml).not.toContain(draft.handle);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/preview\//);
    expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  });
});

test.describe("variant selection", () => {
  let handle: string;

  test.beforeAll(async () => {
    const api = await CatalogApi.login();
    const p = await api.post("/products", { title: `Lamp shade ${RUN}`, price_minor: 2000 });
    await api.put(`/products/${p.id}/options`, {
      options: [
        { name: "Color", values: ["Linen", "Ink"] },
        { name: "Size", values: ["Small", "Large"] },
      ],
    });
    const detail = await api.call<{
      handle: string;
      variants: { id: string; title: string }[];
    }>("GET", `/products/${p.id}`);
    handle = detail.handle;
    const byTitle = Object.fromEntries(detail.variants.map((v) => [v.title, v.id]));
    await api.patch(`/products/${p.id}/variants`, {
      variant_ids: detail.variants.map((v) => v.id),
      set: { price_minor: 2000 },
    });
    await api.patch(`/variants/${byTitle["Ink / Large"]}`, {
      price_minor: 2600,
      compare_at_minor: 3000,
    });
    for (const title of ["Linen / Small", "Linen / Large", "Ink / Large"]) {
      await api.post("/inventory/adjustments", {
        variant_id: byTitle[title],
        mode: "set",
        quantity: 5,
        reason: "received",
      });
    }
    // "Ink / Small" stays at 0 → sold out.
    await api.post(`/products/${p.id}/publish`);
  });

  test("choosing options updates price, stock and the URL", async ({ page }) => {
    await page.goto(`/products/${handle}`);
    await expect(page.getByText("From $20.00")).toHaveCount(0); // detail shows the selected variant
    await expect(page.getByText("Color: Linen")).toBeVisible();
    await expect(page.getByText("$20.00", { exact: true })).toBeVisible();

    const option = (name: string) => page.locator("label", { hasText: new RegExp(`^${name}`) });
    await option("Ink").click();
    await expect(page.getByText("Color: Ink")).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Sold out$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sold out" })).toBeDisabled();
    await expect(page.getByRole("radio", { name: /Small \(sold out\)/ })).toBeChecked();

    await option("Large").click();
    await expect(page.getByText("In stock")).toBeVisible();
    await expect(page.getByText("$26.00", { exact: true })).toBeVisible();
    await expect(page.locator("s", { hasText: "$30.00" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("variant")).toBeTruthy();

    // The variant in the URL is restored on reload.
    await page.reload();
    await expect(page.getByText("Color: Ink")).toBeVisible();
    await expect(page.getByText("Size: Large")).toBeVisible();
  });

  test("quantity stays within 1–99", async ({ page }) => {
    await page.goto(`/products/${handle}`);
    const qty = page.getByRole("spinbutton", { name: "Quantity" });
    await expect(page.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    await page.getByRole("button", { name: "Increase quantity" }).click();
    await expect(qty).toHaveValue("2");
    await qty.fill("500");
    await expect(qty).toHaveValue("99");
  });
});

test.describe("draft preview", () => {
  test("a signed link shows the draft; a tampered one does not", async ({ page }) => {
    const api = await CatalogApi.login();
    const p = await api.post("/products", { title: `Sneak peek ${RUN}`, price_minor: 999 });
    const link = await api.post<{ path: string }>(`/products/${p.id}/preview-link`);
    await page.goto(link.path);
    await expect(page.getByRole("status")).toContainText("Draft — not visible to customers");
    await expect(page.getByRole("heading", { level: 1, name: `Sneak peek ${RUN}` })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect(await page.locator('script[type="application/ld+json"]').count()).toBe(0);

    const res = await page.goto(link.path.replace(/token=[^&]{4}/, "token=XXXX"));
    expect(res?.status()).toBe(404);
  });
});
