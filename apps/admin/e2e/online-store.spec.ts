import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

const RUN = Date.now().toString(36).toUpperCase();

async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("iframe")
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    label,
  ).toEqual([]);
}

/**
 * Store builder: add a theme from a preset, customize it in the editor (click to
 * select in the preview, edit, undo, add a section, switch page), then delete it.
 * Works on an unpublished theme so the shared demo store's look never changes.
 */
test("customize a theme in the editor", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "admin@cartforge.test");
  await page.getByRole("link", { name: "Online store" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Current theme" })).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await scan(page, "themes page");

  await page.getByRole("button", { name: "Add Bazaar" }).click();
  await expect(page.getByText("Bazaar added to your theme library")).toBeVisible();
  const row = page
    .getByRole("listitem")
    .filter({ hasText: "Bazaar" })
    .filter({ has: page.getByRole("link", { name: "Customize" }) });
  await row.getByRole("button", { name: /More actions/ }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill(`Eid ${RUN}`);
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Theme renamed")).toBeVisible();
  const mine = page.getByRole("listitem").filter({ hasText: `Eid ${RUN}` });
  await mine.getByRole("link", { name: "Customize" }).click();

  // The editor: list on the left, the store in the middle.
  await expect(page.getByText(`Eid ${RUN}`)).toBeVisible();
  await expect(page.getByText("Unpublished", { exact: true })).toBeVisible();
  const preview = page.frameLocator('iframe[title="Store preview"]');
  const slide = preview.getByRole("heading", { level: 1, name: "The festive edit" });
  await expect(slide).toBeVisible({ timeout: 15_000 });

  // Click in the preview selects that block.
  await slide.click();
  await expect(page.getByRole("heading", { level: 2, name: "Slide" })).toBeVisible();
  await page.getByLabel("Heading", { exact: true }).fill(`Eid edit ${RUN}`);
  await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
    timeout: 10_000,
  });
  await expect(preview.getByRole("heading", { level: 1, name: `Eid edit ${RUN}` })).toBeVisible({
    timeout: 10_000,
  });
  await scan(page, "editor");

  // Undo puts it back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(preview.getByRole("heading", { level: 1, name: "The festive edit" })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(preview.getByRole("heading", { level: 1, name: `Eid edit ${RUN}` })).toBeVisible({
    timeout: 10_000,
  });

  // Invalid values aren't saved.
  await page.getByLabel("Button link").fill("javascript:alert(1)");
  await expect(page.getByTestId("theme-problems")).toContainText(
    "Slideshow › Slide: Use a path on this store",
  );
  await expect(page.getByTestId("save-status")).toHaveText("Fix the highlighted settings");
  await page.getByLabel("Button link").fill("/products");
  await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
    timeout: 10_000,
  });

  // Add a section to the home page.
  await page.getByRole("button", { name: "Add section" }).nth(1).click();
  await page.getByRole("dialog").getByRole("button", { name: "Video" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Video" })).toBeVisible();
  await page.getByLabel("YouTube or Vimeo link").fill("https://youtu.be/dQw4w9WgXcQ");
  await expect(
    preview.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]'),
  ).toBeAttached({ timeout: 10_000 });

  // An image-only banner: pick a picture from the library.
  await page.getByRole("button", { name: "Add section" }).nth(1).click();
  await page.getByRole("dialog").getByRole("button", { name: "Image banner (image only)" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Image banner (image only)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Choose an image" })
    .getByRole("listitem")
    .first()
    .getByRole("button")
    .click();
  await page.getByLabel("Link", { exact: true }).fill("/products");
  await expect(
    preview.locator('[data-cf-type="image_only_banner"] a[href="/products"] img'),
  ).toBeVisible({ timeout: 10_000 });

  // Brand color: the color schemes follow it.
  await page.getByRole("tab", { name: "Theme settings" }).click();
  await page.getByRole("button", { name: "Colors" }).click();
  await page.getByRole("textbox", { name: "Brand color" }).fill("#0e7490");
  await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
    timeout: 10_000,
  });
  await expect
    .poll(
      () =>
        preview
          .locator("body")
          .evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue("--sf-accent").trim(),
          ),
      { timeout: 10_000 },
    )
    .toBe("#0e7490");
  await scan(page, "colors panel");

  // Theme settings: fonts.
  await page.getByRole("button", { name: "Typography" }).click();
  await page.getByLabel("Heading font").selectOption("playfair");
  await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
    timeout: 10_000,
  });

  // Custom CSS on a section: unsafe CSS is refused, scoped CSS reaches the store.
  await page.getByRole("tab", { name: "Sections" }).click();
  await page
    .getByRole("list", { name: "Home page" })
    .getByRole("button", { name: "Video", exact: true })
    .click();
  await page.getByLabel("Custom CSS").fill("h2 { background: url(https://evil.example/x.png) }");
  await expect(page.getByTestId("theme-problems")).toContainText(
    "Video: Images and fonts from links",
  );
  await page.getByLabel("Custom CSS").fill(":scope { border-top: 3px solid rgb(255, 0, 0) }");
  await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
    timeout: 10_000,
  });
  await expect
    .poll(
      () =>
        preview
          .locator('[data-cf-type="video"]')
          .evaluate((el) => getComputedStyle(el).borderTopColor),
      { timeout: 10_000 },
    )
    .toBe("rgb(255, 0, 0)");

  // An alternate product template.
  await page.getByLabel("Page to edit").selectOption("new:product");
  await page.getByRole("dialog").getByRole("textbox", { name: "Name" }).fill("bridal");
  await page.getByRole("dialog").getByRole("button", { name: "Create template" }).click();
  await expect(page.getByRole("list", { name: "Products: bridal" })).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
    timeout: 10_000,
  });

  // Dynamic values: insert {{ product.title }} into a text block.
  await page
    .getByRole("list", { name: "Products: bridal" })
    .getByRole("button", { name: "Add section" });
  await page.getByRole("button", { name: "Add section" }).nth(1).click();
  await page.getByRole("dialog").getByRole("button", { name: "Rich text" }).click();
  await page
    .getByRole("button", { name: /^Heading/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Insert dynamic value into Heading" }).click();
  await page.getByRole("button", { name: /Product title/ }).click();
  await expect(page.getByLabel("Heading", { exact: true })).toHaveValue(
    /\{\{ product\.title \}\}$/,
  );
  await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
    timeout: 10_000,
  });
  await page.getByLabel("Page to edit").selectOption("home");

  // Another page type.
  await page.getByRole("tab", { name: "Sections" }).click();
  await page.getByLabel("Page to edit").selectOption("product");
  await expect(
    page
      .getByRole("list", { name: "Products" })
      .getByRole("button", { name: "Product information", exact: true }),
  ).toBeVisible();
  await expect(preview.locator('[data-cf-type="main_product"]')).toBeVisible({ timeout: 15_000 });

  // The live store didn't change.
  await page.getByRole("link", { name: "Exit" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Current theme" })).toBeVisible();
  await page
    .getByRole("listitem")
    .filter({ hasText: `Eid ${RUN}` })
    .getByRole("button", { name: /More actions/ })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Theme deleted")).toBeVisible();
});

test("pages and menus", async ({ page }) => {
  await signIn(page, "admin@cartforge.test");
  await page.goto("/admin/online-store/pages/new?template=shipping");
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await expect(title).toHaveValue("Shipping policy");
  await title.fill(`Shipping ${RUN}`);
  await scan(page, "page editor");
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page.getByText("Page created")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/online-store\/pages\/[0-9a-f-]{36}$/);

  await page.goto("/admin/online-store/navigation");
  await expect(page.getByRole("link", { name: "Main menu" })).toBeVisible();
  await scan(page, "navigation");
  await page.getByRole("link", { name: "Add menu" }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(`Help ${RUN}`);
  await page.getByRole("button", { name: "Add menu item" }).click();
  await page.getByLabel("Item title").fill("Shipping");
  await page.getByLabel("Links to").selectOption("page");
  await page.getByLabel("Choose page").selectOption({ label: `Shipping ${RUN}` });
  await page.getByRole("button", { name: "Add menu item" }).click();
  await page.getByLabel("Item title").nth(1).fill("WhatsApp us");
  await page.getByLabel("Links to").nth(1).selectOption("url");
  await page.getByLabel("Web address").fill("https://wa.me/923001234567");
  await page.getByRole("button", { name: "Put WhatsApp us under the item above" }).click();
  await scan(page, "menu editor");
  await page.getByRole("button", { name: "Create menu" }).click();
  await expect(page.getByText("Menu created")).toBeVisible();

  // Tidy up.
  await page.getByRole("button", { name: "Delete menu" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Menu deleted")).toBeVisible();
  await page.goto("/admin/online-store/pages");
  await page.getByRole("link", { name: `Shipping ${RUN}` }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Page deleted")).toBeVisible();
});

test("blog posts", async ({ page }) => {
  await signIn(page, "admin@cartforge.test");
  await page.goto("/admin/online-store/blog");
  await expect(page.getByRole("heading", { level: 1, name: "Online store" })).toBeVisible();
  await scan(page, "blog posts");
  await page.getByRole("link", { name: "Add blog post" }).click();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(`Eid guide ${RUN}`);
  await page.getByLabel("Excerpt").fill("How to style lawn for Eid.");
  await page.getByLabel("Author").fill("Sana");
  await page.getByRole("checkbox", { name: /^Published/ }).check();
  await scan(page, "blog post editor");
  await page.getByRole("button", { name: "Create blog post" }).click();
  await expect(page.getByText("Blog post created")).toBeVisible();
  await page.goto("/admin/online-store/blog");
  const row = page.getByRole("row").filter({ hasText: `Eid guide ${RUN}` });
  await expect(row).toContainText("Published");
  await expect(row).toContainText("News");
  await row.getByRole("link").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Blog post deleted")).toBeVisible();
});

test("custom section, embed and saved sections", async ({ page }) => {
  test.setTimeout(90_000);
  const name = `Strip ${RUN}`;
  await signIn(page, "admin@cartforge.test");
  await page.goto("/admin/online-store");
  await page.getByRole("button", { name: "Add Minimal" }).click();
  await expect(page.getByText("Minimal added to your theme library")).toBeVisible();
  const row = page
    .getByRole("listitem")
    .filter({ hasText: "Minimal" })
    .filter({ has: page.getByRole("link", { name: "Customize" }) })
    .first();
  await row.getByRole("link", { name: "Customize" }).click();
  const preview = page.frameLocator('iframe[title="Store preview"]');
  await expect(preview.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

  // Custom section: two columns, add a countdown to column 2.
  await page.getByRole("button", { name: "Add section" }).nth(1).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Custom section", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 2, name: "Custom section" })).toBeVisible();
  await expect(preview.locator('[data-cf-type="custom_section"]')).toBeVisible({ timeout: 10_000 });
  const tree = page.getByRole("list", { name: "Custom section blocks" });
  await tree.getByRole("button", { name: "Add block" }).click();
  await tree.getByRole("button", { name: "Countdown timer" }).click();
  await page.getByLabel("Ends at").fill("2030-01-01T12:00");
  await page.getByLabel("Column", { exact: true }).selectOption("2");
  await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
    timeout: 10_000,
  });
  await expect(
    preview.locator('[data-cf-type="custom_section"]').getByText("Days", { exact: true }),
  ).toBeVisible({
    timeout: 10_000,
  });
  await scan(page, "custom section block");

  // Embed section with an Instagram post.
  await page.getByRole("button", { name: "Add section" }).nth(1).click();
  await page.getByRole("dialog").getByRole("button", { name: "Embed", exact: true }).click();
  await page.getByLabel("Link", { exact: true }).fill("https://www.instagram.com/p/C0abcDEF123/");
  await expect(page.getByText("✓ Instagram")).toBeVisible();
  await expect(
    preview.locator('iframe[src="https://www.instagram.com/p/C0abcDEF123/embed"]'),
  ).toBeAttached({ timeout: 10_000 });
  await page.getByLabel("Link", { exact: true }).fill("https://evil.example/x");
  await expect(page.getByTestId("theme-problems")).toContainText("Embed: Use a link from YouTube");
  await page
    .getByLabel("Link", { exact: true })
    .fill("https://www.google.com/maps/place/Liberty+Market+Lahore");
  await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
    timeout: 10_000,
  });

  // Save the custom section and add a copy from "Saved sections".
  await page
    .getByRole("list", { name: "Home page" })
    .getByRole("button", { name: "Custom section", exact: true })
    .click();
  await page.getByRole("button", { name: "Save section to reuse" }).click();
  await page.getByRole("dialog", { name: "Save section" }).getByRole("textbox").fill(name);
  await page
    .getByRole("dialog", { name: "Save section" })
    .getByRole("button", { name: "Save" })
    .click();
  await expect(page.getByText(/Section saved/)).toBeVisible();
  await page.getByRole("button", { name: "Add section" }).nth(1).click();
  await page
    .getByRole("dialog", { name: "Add section" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
  await expect(preview.locator('[data-cf-type="custom_section"]')).toHaveCount(2, {
    timeout: 10_000,
  });
  await expect(page.getByTestId("save-status")).toHaveText("All changes saved", {
    timeout: 10_000,
  });

  // Tidy up: the saved section and the theme.
  await page.getByRole("button", { name: "Add section" }).nth(1).click();
  await page.getByRole("button", { name: `Delete saved section ${name}` }).click();
  await expect(page.getByRole("button", { name: `Delete saved section ${name}` })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Exit" }).click();
  const mine = page
    .getByRole("listitem")
    .filter({ hasText: "Minimal" })
    .filter({ has: page.getByRole("link", { name: "Customize" }) })
    .first();
  await mine.getByRole("button", { name: /More actions/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Theme deleted")).toBeVisible();
});
