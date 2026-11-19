import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

const RUN = `vi${Date.now().toString(36)}`;

async function createSimple(
  page: Page,
  title: string,
  fields: { price?: string; sku?: string; qty?: string; threshold?: string },
) {
  await page.goto("/admin/products/new");
  await page.getByLabel("Title").fill(title);
  if (fields.price) await page.getByLabel("Price", { exact: true }).fill(fields.price);
  if (fields.sku) await page.getByLabel("SKU (stock keeping unit)").fill(fields.sku);
  if (fields.qty) await page.getByLabel("Quantity", { exact: true }).fill(fields.qty);
  if (fields.threshold) await page.getByLabel("Low-stock alert at").fill(fields.threshold);
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product created")).toBeVisible();
  await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/);
}

const variantsTable = (page: Page) => page.getByRole("table", { name: "Variants" });

test.describe("Variants and inventory (Sprint 3)", () => {
  test("simple product: SKU, starting stock, adjust and history", async ({ page }) => {
    await signIn(page, "admin@cartforge.test");
    await createSimple(page, `Mug ${RUN}`, {
      price: "12",
      sku: `MUG-${RUN}`,
      qty: "6",
      threshold: "2",
    });
    await expect(page.getByTestId("stock-on-hand")).toHaveText("6");

    await page.getByRole("button", { name: "Adjust stock" }).click();
    const dialog = page.getByRole("dialog", { name: "Adjust stock" });
    await dialog.getByRole("tab", { name: "Set counted quantity" }).click();
    await dialog.getByLabel("Counted quantity").fill("10");
    await expect(dialog.getByText("10", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Stock updated/)).toBeVisible();
    await expect(page.getByTestId("stock-on-hand")).toHaveText("10");

    await page.getByRole("button", { name: "History" }).click();
    const history = page.getByRole("list", { name: "Stock movements" });
    await expect(history.getByRole("listitem")).toHaveCount(2);
    await expect(history.getByRole("listitem").first()).toContainText("Correction (count)");
    await expect(history.getByRole("listitem").first()).toContainText("+4");
    await expect(history.getByRole("listitem").nth(1)).toContainText("Initial stock");
  });

  test("options → preview → apply; edit, bulk-price and remove variants", async ({ page }) => {
    await signIn(page, "admin@cartforge.test");
    await createSimple(page, `Hoodie ${RUN}`, { price: "40", sku: `HOOD-${RUN}`, qty: "6" });

    await page.getByRole("button", { name: "Add options" }).click();
    await page.getByLabel("Option 1 name").fill("Size");
    const values = page.getByLabel("Size values");
    await values.fill("S");
    await values.press("Enter");
    await values.fill("M, L");
    await expect(page.getByText("3 variants")).toBeVisible();
    await page.getByRole("button", { name: "Review changes" }).click();

    const review = page.getByRole("dialog", { name: "Review variant changes" });
    await expect(review).toContainText("1 → 3 variants");
    await expect(review).toContainText("Default → S");
    await expect(review).toContainText("M");
    await review.getByRole("button", { name: "Apply changes" }).click();
    await expect(page.getByText("Variants updated")).toBeVisible();

    const table = variantsTable(page);
    await expect(table.getByRole("row")).toHaveCount(4);
    const sRow = table.getByRole("row", { name: /\bS\b/ });
    await expect(sRow).toContainText(`HOOD-${RUN}`);
    await expect(sRow).toContainText("$40.00");
    await expect(sRow).toContainText("6");
    await expect(page.getByText("Variable — has options")).toBeVisible();

    // Edit one variant.
    await page.getByRole("button", { name: "Actions for M" }).click();
    await page.getByRole("menuitem", { name: "Edit variant" }).click();
    const edit = page.getByRole("dialog", { name: "Edit M" });
    await edit.getByLabel("Price", { exact: true }).fill("45");
    await edit.getByLabel("SKU").fill(`HOOD-M-${RUN}`);
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved M")).toBeVisible();
    await expect(table.getByRole("row", { name: /\bM\b/ })).toContainText("$45.00");

    // Bulk price.
    await page.getByLabel("Select all variants").check();
    await page
      .getByRole("region", { name: "Bulk actions" })
      .getByRole("button", { name: "Edit prices" })
      .click();
    const bulk = page.getByRole("dialog", { name: "Edit prices for 3 variants" });
    await bulk.getByLabel("Price", { exact: true }).fill("38");
    await bulk.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("Updated 3 variants")).toBeVisible();
    await expect(table.getByText("$38.00")).toHaveCount(3);

    // Remove a value: preview warns, apply removes.
    await page.getByRole("button", { name: "Edit options" }).click();
    await page.getByRole("button", { name: "Remove L" }).click();
    await page.getByRole("button", { name: "Review changes" }).click();
    await expect(review).toContainText("1 variant will be removed");
    await review.getByRole("button", { name: "Remove 1 and apply" }).click();
    await expect(page.getByText("Variants updated")).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(3);

    // List shows the variable product with variants and stock.
    await page.goto(`/admin/products?q=${encodeURIComponent(`Hoodie ${RUN}`)}`);
    await expect(page.getByRole("row", { name: new RegExp(`Hoodie ${RUN}`) })).toContainText(
      "6 in stock · 2 variants",
    );
  });

  test("inventory page: tabs, search, adjust and history", async ({ page }) => {
    await signIn(page, "admin@cartforge.test");
    await createSimple(page, `Candle ${RUN}`, {
      price: "9",
      sku: `CAN-${RUN}`,
      qty: "1",
      threshold: "3",
    });

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Inventory" })
      .click();
    await page.getByRole("searchbox", { name: "Search inventory" }).fill(`CAN-${RUN}`);
    const row = page.getByRole("row", { name: new RegExp(`Candle ${RUN}`) });
    await expect(row).toContainText("Low stock");

    await page.getByRole("tab", { name: "Low stock" }).click();
    await expect(page).toHaveURL(/stock=low/);
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: `Adjust stock for Candle ${RUN}` }).click();
    const dialog = page.getByRole("dialog", { name: "Adjust stock" });
    await dialog.getByLabel("Change by").fill("5");
    await dialog.getByLabel("Reason").selectOption("received");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Stock updated: Candle .* now 6/)).toBeVisible();
    // No longer low stock → leaves the Low stock view.
    await expect(row).toHaveCount(0);

    await page.getByRole("tab", { name: "All" }).click();
    await expect(row).toContainText("In stock");
    await row.getByRole("button", { name: `Stock history for Candle ${RUN}` }).click();
    await expect(
      page.getByRole("list", { name: "Stock movements" }).getByRole("listitem").first(),
    ).toContainText("+5");
  });

  test("catalog managers see stock but can't adjust it", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await page.goto("/admin/inventory");
    await expect(page.getByRole("heading", { name: "Inventory", level: 1 })).toBeVisible();
    await expect(page.getByRole("row").nth(1)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Adjust stock for/ })).toHaveCount(0);
  });
});
