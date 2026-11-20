import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { CatalogApi, RUN } from "./catalog-api";

/** WCAG 2.1 AA (PRD FE-007, §30) on every storefront template. */
test.describe("storefront accessibility", () => {
  let handle: string;
  let category: string;

  test.beforeAll(async () => {
    const api = await CatalogApi.login();
    const c = await api.post("/categories", { name: `Axe ${RUN}` });
    category = c.handle;
    const p = await api.post("/products", {
      title: `Axe product ${RUN}`,
      price_minor: 1500,
      compare_at_minor: 2000,
      status: "active",
      category_ids: [c.id],
    });
    handle = p.handle;
  });

  const pages = () => [
    ["home", "/"],
    ["all products", "/products"],
    ["collections", "/collections"],
    ["category", `/categories/${category}`],
    ["product", `/products/${handle}`],
    ["search results", `/search?q=${RUN}`],
    ["empty search", "/search"],
    ["not found", "/products/definitely-not-here"],
  ];

  for (const [name, i] of [
    ["home", 0],
    ["all products", 1],
    ["collections", 2],
    ["category", 3],
    ["product", 4],
    ["search results", 5],
    ["empty search", 6],
    ["not found", 7],
  ] as const) {
    test(`${name} has no WCAG 2.1 AA violations`, async ({ page }) => {
      await page.goto(pages()[i]![1]!);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)).toEqual([]);
    });
  }

  test("skip link moves focus to the content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});
