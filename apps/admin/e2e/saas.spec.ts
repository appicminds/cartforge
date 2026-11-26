import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openStore, signIn } from "./helpers";

/** P1 — SaaS: sign-up, separate stores, domains, platform administration. */
const RUN = Date.now().toString(36);
const EMAIL = `merchant-${RUN}@example.com`;
const PASSWORD = "bright-lamp-2049";
const STORE = `Lumen Lab ${RUN}`;

async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target} ${v.nodes[0]?.html}`),
    label,
  ).toEqual([]);
}

test.describe.configure({ mode: "serial" });

test("a merchant signs up and lands in their new store", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Create your store" }).click();
  await expect(page.getByRole("heading", { name: "Create your store" })).toBeVisible();
  await scan(page, "signup");

  // Validation first.
  await page.getByRole("button", { name: "Create store" }).click();
  await expect(page.getByText("Enter your name")).toBeVisible();

  await page.getByLabel("Your name").fill("Lena Lumen");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Store name").fill(STORE);
  const address = `lumen-lab-${RUN}`.toLowerCase();
  await expect(page.getByText(`Available — https://${address}.shops.localhost`)).toBeVisible();
  await page.getByRole("button", { name: "Create store" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Welcome, Lena" })).toBeVisible();
  await expect(page.getByTestId("current-store")).toHaveText(STORE);
  await expect(page.getByRole("link", { name: "View store" })).toHaveAttribute(
    "href",
    `http://${address}.shops.localhost:3100`,
  );
  // A fresh store is empty and isolated.
  await page.getByRole("link", { name: "Products" }).click();
  await expect(page.getByRole("heading", { name: "Add your first product" })).toBeVisible();
});

test("the same email can't sign up twice", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Copycat");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel("Store name").fill(`Copy ${RUN}`);
  await page.getByRole("button", { name: "Create store" }).click();
  await expect(page.getByText("An account with this email already exists.")).toBeVisible();
});

test("a merchant opens a second store and switches between them", async ({ page }) => {
  await signIn(page, EMAIL, PASSWORD);
  await page.getByRole("link", { name: "Switch store" }).click();
  await expect(page.getByRole("heading", { name: "Your stores" })).toBeVisible();
  await scan(page, "your stores");
  await page.getByRole("button", { name: "Create store" }).click();
  const dialog = page.getByRole("dialog", { name: "Create another store" });
  await dialog.getByLabel("Store name").fill(`Lumen Outlet ${RUN}`);
  await dialog.getByLabel("Currency").selectOption("EUR");
  await dialog.getByRole("button", { name: "Create store" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("current-store")).toHaveText(`Lumen Outlet ${RUN}`);

  await page.getByRole("link", { name: "Switch store" }).click();
  await expect(page.getByRole("button", { name: `Open ${STORE}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});

test("a merchant connects a custom domain", async ({ page }) => {
  await signIn(page, EMAIL, PASSWORD);
  // Two stores now, so sign-in lands on the picker.
  await expect(page).toHaveURL(/\/admin\/stores$/);
  await openStore(page, STORE);
  await page.getByRole("link", { name: "Domains" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Domains" })).toBeVisible();
  await expect(page.getByText("Platform address")).toBeVisible();
  await page.getByRole("textbox", { name: "Domain" }).fill("lumen.shops.localhost");
  await page.getByRole("button", { name: "Add domain" }).click();
  await expect(
    page.getByText(/managed by the platform|not one on shops\.localhost/).first(),
  ).toBeVisible();

  const host = `shop-${RUN}.example.com`.toLowerCase();
  await page.getByRole("textbox", { name: "Domain" }).fill(`https://${host}/`);
  await page.getByRole("button", { name: "Add domain" }).click();
  await expect(page.getByText(host, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Waiting for DNS")).toBeVisible();
  const table = page.getByRole("table", { name: `DNS records for ${host}` });
  await expect(table).toContainText(`_cartforge-verify.${host}`);
  await scan(page, "domains");
  // No DNS record exists, so verification explains what's missing.
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/couldn't find the TXT record/).first()).toBeVisible();
});

test("platform admins see every store and can suspend one", async ({ page, browser }) => {
  await signIn(page, "platform@cartforge.test");
  await expect(page).toHaveURL(/\/admin\/platform\/stores$/);
  await scan(page, "platform stores");
  await page.getByRole("searchbox", { name: "Search stores" }).fill(EMAIL);
  const row = page.getByRole("row").filter({ hasText: STORE });
  await expect(row).toContainText(EMAIL);
  await expect(page.getByRole("row")).toHaveCount(3); // header + both of the merchant's stores
  await row.getByRole("button", { name: `Suspend ${STORE}` }).click();
  const dialog = page.getByRole("dialog", { name: `Suspend ${STORE}?` });
  await dialog.getByRole("button", { name: "Suspend store" }).click();
  await expect(dialog.getByText("Give a reason for the suspension")).toBeVisible();
  await dialog.getByLabel("Reason").fill("Test suspension");
  await dialog.getByRole("button", { name: "Suspend store" }).click();
  await expect(row).toContainText("Suspended");

  // The merchant sees it suspended and can't open it.
  const ctx = await browser.newContext();
  const merchant = await ctx.newPage();
  await signIn(merchant, EMAIL, PASSWORD);
  await merchant.goto("/admin/stores");
  const item = merchant.getByRole("listitem").filter({ hasText: STORE });
  await expect(item).toContainText("Suspended");
  await expect(item.getByRole("button", { name: `Open ${STORE}` })).toBeDisabled();
  await ctx.close();

  await row.getByRole("button", { name: `Reactivate ${STORE}` }).click();
  await expect(row).toContainText("Active");
});

test("store staff never see platform pages", async ({ page }) => {
  await signIn(page, "admin@cartforge.test");
  await expect(page.getByRole("link", { name: "All stores" })).toHaveCount(0);
  await page.goto("/admin/platform/stores");
  await expect(page.getByText("Platform administrators only")).toBeVisible();
});

test("sign-up starts with the email typed on the marketing site", async ({ page }) => {
  await page.goto("/signup?email=new.seller%40example.com");
  await expect(page.getByLabel("Email")).toHaveValue("new.seller@example.com");
  await page.goto("/signup?email=not-an-email");
  await expect(page.getByLabel("Email")).toHaveValue("");
});
