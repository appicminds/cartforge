import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { uniquePng } from "./images";

const RUN = `mp${Date.now().toString(36)}`;

async function newProduct(page: Page, title: string) {
  await page.goto("/admin/products/new");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
}

const gallery = (page: Page) => page.getByRole("list", { name: "Product images" });

test.describe("Products — images and pricing (Sprint 2)", () => {
  test("upload images, choose primary, set pricing; everything persists", async ({ page }) => {
    const title = `Canvas Tote ${RUN}`;
    await signIn(page, "catalog@cartforge.test");
    await newProduct(page, title);

    await page
      .getByLabel("Upload images")
      .setInputFiles([uniquePng("front.png"), uniquePng("back.png")]);
    await expect(gallery(page).getByRole("img")).toHaveCount(2);
    await expect(gallery(page)).toContainText("Primary");

    // Make the second image primary via its action menu (keyboard-accessible).
    await page.getByRole("button", { name: "Image 2 actions" }).click();
    await page.getByRole("menuitem", { name: "Set as primary" }).click();
    // It moves to the front: the first image is the primary.
    await expect(page.getByRole("button", { name: "Image 2 actions" })).toBeVisible();

    // Alt text on the primary image.
    await page.getByRole("button", { name: "Image 1 actions (primary)" }).click();
    await page.getByRole("menuitem", { name: "Edit alt text" }).click();
    await page.getByRole("textbox", { name: "Alt text" }).fill("Tote, back view");
    await page.getByRole("button", { name: "Done" }).click();

    await page.getByLabel("Price", { exact: true }).fill("24.99");
    await page.getByLabel("Compare-at price").fill("30");
    await page.getByLabel("Cost per item").fill("10");
    await expect(page.getByText("$14.99")).toBeVisible();
    await expect(page.getByText("60%")).toBeVisible();

    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText("Product created")).toBeVisible();
    await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/);

    await page.reload();
    await expect(page.getByLabel("Price", { exact: true })).toHaveValue("24.99");
    await expect(page.getByLabel("Compare-at price")).toHaveValue("30.00");
    await expect(page.getByLabel("Cost per item")).toHaveValue("10.00");
    await expect(gallery(page).getByRole("img")).toHaveCount(2);
    await expect(gallery(page).getByRole("img", { name: "Tote, back view" })).toBeVisible();
    await expect(gallery(page).getByRole("img").first()).toHaveAccessibleName("Tote, back view");
    await expect(page.getByRole("button", { name: "Image 1 actions (primary)" })).toBeVisible();
    await page.goto(`/admin/products?q=${encodeURIComponent(title)}`);
    const row = page.getByRole("row", { name: new RegExp(title) });
    await expect(row).toContainText("$24.99");
    await expect(row.locator("img")).toHaveAttribute("src", /thumb\.webp/);
  });

  test("rejected uploads can be retried or removed; saving waits for uploads", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await newProduct(page, `Bad upload ${RUN}`);
    await page.getByLabel("Upload images").setInputFiles({
      name: "fake.png",
      mimeType: "image/png",
      buffer: Buffer.from("this is not an image"),
    });
    const alert = gallery(page).getByRole("alert");
    await expect(alert).toContainText("Only JPEG, PNG and WebP images are supported.");
    await expect(alert.getByRole("button", { name: "Retry fake.png" })).toBeVisible();
    await alert.getByRole("button", { name: "Remove fake.png" }).click();
    await expect(page.getByRole("button", { name: "Upload images" })).toBeVisible();
  });

  test("validates prices client- and server-side", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await newProduct(page, `Bad prices ${RUN}`);
    await page.getByLabel("Price", { exact: true }).fill("12.345");
    await page.getByLabel("Compare-at price").fill("5");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText(/Enter an amount like 19\.99/)).toBeVisible();

    await page.getByLabel("Price", { exact: true }).fill("12");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText("Compare-at price must be higher than the price")).toBeVisible();
    await expect(page).toHaveURL(/\/new$/);
  });

  test("publishing requires a price", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await newProduct(page, `Unpriced ${RUN}`);
    await page.getByLabel("Product status").selectOption("active");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText("Set a price before publishing.")).toBeVisible();
    await expect(page.getByLabel("Price", { exact: true })).toHaveAttribute("aria-invalid", "true");
  });

  test("reuses an existing image from the library", async ({ page }) => {
    await signIn(page, "catalog@cartforge.test");
    await newProduct(page, `Library ${RUN}`);
    await page.getByRole("button", { name: "Select existing" }).click();
    const dialog = page.getByRole("dialog", { name: "Select images" });
    await dialog.getByRole("list", { name: "Store images" }).getByRole("button").first().click();
    await dialog.getByRole("button", { name: /Add 1 image/ }).click();
    await expect(gallery(page).getByRole("img")).toHaveCount(1);
    await page.getByLabel("Price", { exact: true }).fill("9.5");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText("Product created")).toBeVisible();
    await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Price", { exact: true })).toHaveValue("9.50");
  });
});
