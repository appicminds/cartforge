import { expect, test, type Page } from "@playwright/test";
import { openStore, signIn } from "./helpers";

const RUN = `e2e${Date.now().toString(36)}`;

async function openProducts(page: Page) {
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Products" })
    .click();
  await expect(page.getByRole("heading", { name: "Products", level: 1 })).toBeVisible();
}

async function createProduct(
  page: Page,
  title: string,
  opts: { vendor?: string; handle?: string } = {},
) {
  await page.goto("/admin/products/new");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  if (opts.vendor) await page.getByLabel("Vendor / brand").fill(opts.vendor);
  if (opts.handle) await page.getByLabel("URL handle", { exact: true }).fill(opts.handle);
  await page.getByRole("button", { name: "Save product" }).click();
}

/** After "Product created" the app redirects to the product page; wait for it before editing. */
async function waitForProductPage(page: Page) {
  await expect(page.getByText("Product created")).toBeVisible();
  await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeEnabled();
}

test.describe("Products — Sprint 1 exit gate", () => {
  test("create a draft, find it, open it, edit it, and changes persist after refresh", async ({
    page,
  }) => {
    const title = `Linen Apron ${RUN}`;
    await signIn(page, "catalog@cartforge.test");
    await openProducts(page);

    await page.getByRole("link", { name: "Add product" }).first().click();
    await expect(page.getByRole("heading", { name: "Add product" })).toBeVisible();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
    // Placeholder previews the generated handle.
    await expect(page.getByLabel("URL handle", { exact: true })).toHaveAttribute(
      "placeholder",
      `linen-apron-${RUN.toLowerCase()}`,
    );
    const editor = page.getByRole("textbox", { name: "Description", exact: true });
    await editor.click();
    await page.keyboard.type("Heavyweight linen. ");
    await page.getByRole("button", { name: "Bold" }).click();
    await page.keyboard.type("Machine washable.");
    await page.getByLabel("Vendor / brand").fill("Northwind Workshop");
    await page.getByRole("button", { name: "Save product" }).click();

    await waitForProductPage(page);
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText(title);

    await page.reload();
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(title);
    await expect(editor.locator("strong")).toHaveText("Machine washable.");
    await expect(page.getByLabel("URL handle", { exact: true })).toHaveValue(
      `linen-apron-${RUN.toLowerCase()}`,
    );

    // Find it in the list via server-side search; search is kept in the URL.
    await page.getByRole("link", { name: "Back to products" }).click();
    await page.getByRole("searchbox", { name: "Search products" }).fill(RUN);
    await expect(page).toHaveURL(new RegExp(`q=${RUN}`));
    const row = page.getByRole("row", { name: new RegExp(title) });
    await expect(row).toContainText("Draft");
    await expect(row).toContainText("Northwind Workshop");

    // Open, edit, save, refresh.
    await row.getByRole("link", { name: title }).click();
    await page.getByRole("textbox", { name: "Title", exact: true }).fill(`${title} v2`);
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Product saved")).toBeVisible();
    await expect(page.getByText("Unsaved changes")).toBeHidden();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(
      `${title} v2`,
    );

    // Returning to the list preserves the previous search.
    await page.getByRole("link", { name: "Back to products" }).click();
    await expect(page.getByRole("searchbox", { name: "Search products" })).toHaveValue(RUN);
    await expect(page.getByRole("row", { name: new RegExp(`${title} v2`) })).toBeVisible();
  });

  test("shows field errors for a duplicate handle and invalid title", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await createProduct(page, `Handle Owner ${RUN}`, { handle: `dup-${RUN.toLowerCase()}` });
    await waitForProductPage(page);

    await page.goto("/admin/products/new");
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("   ");
    await page.getByLabel("URL handle", { exact: true }).fill(`dup-${RUN.toLowerCase()}`);
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText("This field is required")).toBeVisible();

    await page.getByRole("textbox", { name: "Title", exact: true }).fill(`Handle Thief ${RUN}`);
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(
      page.getByText(`The handle "dup-${RUN.toLowerCase()}" is already in use.`),
    ).toBeVisible();
    await expect(page.getByLabel("URL handle", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page).toHaveURL(/\/admin\/products\/new$/);
  });

  test("publishes a product and requires confirmation to change a published handle", async ({
    page,
  }) => {
    await signIn(page, "catalog@cartforge.test");
    await createProduct(page, `Publish Me ${RUN}`);
    await waitForProductPage(page);
    await page.getByLabel("Price", { exact: true }).fill("15");
    await page.getByLabel("Product status").selectOption("active");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Product saved")).toBeVisible();
    await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();

    await page.getByLabel("URL handle", { exact: true }).fill(`published-${RUN.toLowerCase()}`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Change the URL handle?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Change handle" }).click();
    await expect(page.getByText("Product saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("URL handle", { exact: true })).toHaveValue(
      `published-${RUN.toLowerCase()}`,
    );
  });

  test("warns before leaving with unsaved changes", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await createProduct(page, `Guarded ${RUN}`);
    await waitForProductPage(page);
    await page.getByRole("textbox", { name: "Title", exact: true }).fill("Changed but not saved");

    page.once("dialog", (d) => d.dismiss());
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Home" })
      .click();
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(
      "Changed but not saved",
    );

    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(
      `Guarded ${RUN}`,
    );
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Home" })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("deletes a product from the row menu after confirmation", async ({ page }) => {
    const title = `Doomed ${RUN}`;
    await signIn(page, "catalog@cartforge.test");
    await createProduct(page, title);
    await waitForProductPage(page);

    await page.goto(`/admin/products?q=${encodeURIComponent(title)}`);
    await page.getByRole("button", { name: `Actions for ${title}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete product?" });
    await expect(dialog).toContainText(title);
    await dialog.getByRole("button", { name: "Delete product" }).click();
    await expect(page.getByText("Product deleted")).toBeVisible();
    await expect(page.getByText("No products match your search")).toBeVisible();
  });
});

test.describe("Products — list states and permissions", () => {
  test("rows open the product; '/' focuses search; Ctrl+S saves", async ({ page }) => {
    const title = `Shortcut ${RUN}`;
    await signIn(page, "catalog@cartforge.test");
    await createProduct(page, title);
    await waitForProductPage(page);

    await page.goto(`/admin/products?q=${encodeURIComponent(title)}`);
    await page
      .getByRole("row", { name: new RegExp(title) })
      .getByRole("cell")
      .nth(4)
      .click();
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();

    await page
      .getByRole("textbox", { name: "Title", exact: true })
      .fill(`${title} saved by keyboard`);
    await expect(page.getByRole("region", { name: "Save changes" })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+s");
    await expect(page.getByText("Product saved")).toBeVisible();
    await expect(page.getByRole("region", { name: "Save changes" })).toBeHidden();

    await page.goto("/admin/products");
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox", { name: "Search products" })).toBeFocused();
  });

  test("first-use empty state in a store with no products", async ({ page }) => {
    await signIn(page, "owner@cartforge.test");
    await openStore(page, "Quiet Pines");
    await openProducts(page);
    await expect(page.getByRole("heading", { name: "Add your first product" })).toBeVisible();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
  });

  test("no-results state with clear filters", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await page.goto(`/admin/products?q=zz-nothing-${RUN}&status=archived`);
    await expect(page.getByText("No products match your search")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).first().click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    await expect(page.getByRole("searchbox", { name: "Search products" })).toHaveValue("");
  });

  test("status filter and sorting are reflected in the URL", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await openProducts(page);
    await page.getByRole("tab", { name: "Active" }).click();
    await expect(page.getByRole("tab", { name: "Active" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page).toHaveURL(/status=active/);
    await page.getByRole("button", { name: "Product", exact: true }).click();
    await expect(page).toHaveURL(/sort=title/);
    await expect(page.getByRole("columnheader", { name: "Product", exact: true })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    await page.reload();
    await expect(page.getByRole("tab", { name: "Active" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("read-only roles can view but not create or edit", async ({ page }) => {
    await signIn(page, "orders@cartforge.test");
    await openProducts(page);
    await expect(
      page.getByText("Your role can view products but not create or change them."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Add product" })).toHaveCount(0);

    const first = page.getByRole("row").nth(1).getByRole("link").first();
    await first.click();
    await expect(page.getByRole("textbox", { name: "Title", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);

    await page.goto("/admin/products/new");
    await expect(page.getByText("You don't have permission to add products.")).toBeVisible();
  });

  test("unknown product ids show a not-found state", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await page.goto("/admin/products/00000000-0000-4000-8000-00000000dead");
    await expect(page.getByRole("heading", { name: "Product not found" })).toBeVisible();
  });
});
