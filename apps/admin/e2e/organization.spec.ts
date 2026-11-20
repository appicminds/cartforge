import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

const RUN = `org${Date.now().toString(36)}`;

async function newProduct(page: Page, title: string, price?: string) {
  await page.goto("/admin/products/new");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  if (price) await page.getByLabel("Price", { exact: true }).fill(price);
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product created")).toBeVisible();
  await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/);
}

async function addCategory(page: Page, name: string, parent?: string) {
  await page.getByRole("button", { name: "Add category" }).first().click();
  const d = page.getByRole("dialog", { name: "Add category" });
  await d.getByLabel("Name").fill(name);
  if (parent) await d.getByLabel("Parent category").selectOption({ label: parent });
  await d.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Category created").last()).toBeVisible();
}

test.describe("Organization, SEO, bulk, duplicate (Sprint 4)", () => {
  test("categories: nested tree and delete with reassignment", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Categories" })
      .click();
    await addCategory(page, `Garden ${RUN}`);
    await addCategory(page, `Pots ${RUN}`, `Garden ${RUN}`);
    await addCategory(page, `Seeds ${RUN}`);
    const tree = page.getByRole("list", { name: "Categories" });
    await expect(tree.getByText(`Pots ${RUN}`)).toBeVisible();

    // Put a product in "Seeds", then delete Seeds moving products to Pots.
    await newProduct(page, `Basil ${RUN}`);
    await page.getByRole("button", { name: "Add categories" }).click();
    const picker = page.getByRole("dialog", { name: "Categories" });
    await picker.getByLabel("Search categories").fill(`Seeds ${RUN}`);
    await picker.getByLabel(`Seeds ${RUN}`).check();
    await picker.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Product saved")).toBeVisible();

    await page.goto("/admin/categories");
    await page.getByRole("button", { name: `Actions for Seeds ${RUN}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const del = page.getByRole("dialog", { name: `Delete Seeds ${RUN}?` });
    await expect(del).toContainText("1 product is in this category");
    await del.getByLabel("Move products to").selectOption({ label: `\u00a0\u00a0Pots ${RUN}` });
    await del.getByRole("button", { name: "Delete category" }).click();
    await expect(page.getByText("Category deleted")).toBeVisible();
    await expect(tree.getByText(`Seeds ${RUN}`)).toHaveCount(0);
    await expect(tree.getByRole("listitem").filter({ hasText: `Pots ${RUN}` })).toContainText(
      "1 product",
    );
  });

  test("product organization and SEO persist; search preview updates", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await newProduct(page, `Lamp ${RUN}`, "49");
    await page.getByLabel("Tags").fill("Lighting");
    await page.getByLabel("Tags").press("Enter");
    await page.getByLabel("Tags").fill("Gift");
    await page.getByLabel("Tags").press("Enter");
    await page.getByLabel("Page title").fill(`Brass desk lamp ${RUN}`);
    await page.getByLabel("Meta description").fill("Warm light for small desks.");
    const preview = page.getByRole("group", { name: "Search result preview" });
    await expect(preview).toContainText(`Brass desk lamp ${RUN}`);
    await expect(preview).toContainText("Warm light for small desks.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Product saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Page title")).toHaveValue(`Brass desk lamp ${RUN}`);
    await expect(page.getByText("Lighting", { exact: true })).toBeVisible();
    await expect(page.getByText("Gift", { exact: true })).toBeVisible();
  });

  test("bulk publish reports products that can't be published; bulk tags", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await newProduct(page, `Bulk One ${RUN}`, "10");
    await newProduct(page, `Bulk Two ${RUN}`, "12");
    await newProduct(page, `Bulk Unpriced ${RUN}`);
    await page.goto(`/admin/products?q=${encodeURIComponent(RUN)}&sort=title&order=asc`);
    for (const t of ["Bulk One", "Bulk Two", "Bulk Unpriced"])
      await page.getByLabel(`Select ${t} ${RUN}`).check();
    const bar = page.getByRole("region", { name: "Bulk actions" });
    await expect(bar).toContainText("3 selected");
    await bar.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Published 2 products")).toBeVisible();
    const failed = page.getByRole("dialog", { name: "1 product couldn't be updated" });
    await expect(failed).toContainText(`Bulk Unpriced ${RUN}`);
    await expect(failed).toContainText("Set a price before publishing.");
    await failed.getByRole("button", { name: "OK" }).click();
    await expect(bar).toContainText("1 selected"); // failures stay selected

    await page.getByLabel("Select all products on this page").check();
    await bar.getByRole("button", { name: "More bulk actions" }).click();
    await page.getByRole("menuitem", { name: "Add tags" }).click();
    const dlg = page.getByRole("dialog", { name: "Add tags" });
    await dlg.getByLabel("Tags").fill(`batch-${RUN}`);
    await dlg.getByLabel("Tags").press("Enter");
    await dlg.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/products$/).filter({ hasText: "Updated" })).toBeVisible();
  });

  test("duplicate a product from its page", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await newProduct(page, `Rug ${RUN}`, "120");
    await page.getByRole("button", { name: "Duplicate" }).click();
    const d = page.getByRole("dialog", { name: "Duplicate product" });
    await expect(d.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(
      `Copy of Rug ${RUN}`,
    );
    await d.getByRole("button", { name: "Duplicate" }).click();
    await expect(page.getByText("Product duplicated")).toBeVisible();
    await expect(page.getByRole("heading", { name: `Copy of Rug ${RUN}`, level: 1 })).toBeVisible();
    await expect(page.getByLabel("Price", { exact: true })).toHaveValue("120.00");
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
  });

  test("collections: create, add products, reorder, publish, filter list", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await newProduct(page, `Alpha Cup ${RUN}`, "8");
    await newProduct(page, `Beta Cup ${RUN}`, "9");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Collections" })
      .click();
    await page.getByRole("button", { name: "Create collection" }).first().click();
    await page
      .getByRole("dialog", { name: "Create collection" })
      .getByRole("textbox", { name: "Title", exact: true })
      .fill(`Cups ${RUN}`);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByRole("heading", { name: `Cups ${RUN}`, level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Add products" }).click();
    const add = page.getByRole("dialog", { name: "Add products" });
    await add.getByLabel("Search products").fill(`Cup ${RUN}`);
    await add.getByLabel(`Alpha Cup ${RUN}`).check();
    await add.getByLabel(`Beta Cup ${RUN}`).check();
    await add.getByRole("button", { name: "Add 2" }).click();
    await expect(page.getByText("Added 2 products")).toBeVisible();
    const items = page.getByRole("list", { name: "Collection products" }).getByRole("listitem");
    await expect(items.first()).toContainText(`Alpha Cup ${RUN}`);
    await page.getByRole("button", { name: `Move Beta Cup ${RUN} up` }).click();
    await expect(page.getByText("Order saved")).toBeVisible();
    await expect(items.first()).toContainText(`Beta Cup ${RUN}`);

    await page.getByLabel("Status").selectOption("active");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Collection saved")).toBeVisible();

    await page.goto("/admin/products");
    await page.getByLabel("Filter by collection").selectOption({ label: `Cups ${RUN}` });
    await expect(page).toHaveURL(/collection_id=/);
    await expect(page.getByRole("row")).toHaveCount(3); // header + 2
  });
});
