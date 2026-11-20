import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/** Change password, forgot password, and the platform admin's reset link. */
const RUN = Date.now().toString(36);
const EMAIL = `pat-${RUN}@example.com`;
const STORE = `Pat Prints ${RUN}`;

async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    label,
  ).toEqual([]);
}

test.describe.configure({ mode: "serial" });

test("forgot password never reveals whether an account exists", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await scan(page, "forgot");
  await page.getByLabel("Email").fill(`nobody-${RUN}@example.com`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
});

test("a merchant changes their password", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Pat Prints");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill("first-Password-1");
  await page.getByLabel("Store name").fill(STORE);
  await page.getByRole("button", { name: "Create store" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  // New accounts are asked to confirm their email.
  await expect(page.getByText("Confirm your email address")).toBeVisible();
  await page.getByRole("button", { name: "Send again" }).click();
  await expect(page.getByRole("button", { name: "Sent" })).toBeDisabled();

  await page.getByRole("button", { name: "Account menu for Pat Prints" }).click();
  await page.getByRole("menuitem", { name: "Change password" }).click();
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await scan(page, "account");

  await page.getByLabel("Current password").fill("wrong-Password-0");
  await page.getByRole("textbox", { name: "New password", exact: true }).fill("second-Password-2");
  await page.getByLabel("Confirm new password").fill("second-Password-2");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Incorrect password")).toBeVisible();

  await page.getByLabel("Current password").fill("first-Password-1");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed")).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, EMAIL, "second-Password-2");
  await expect(page).toHaveURL(/\/admin$/);
});

test("a platform admin hands a merchant a reset link", async ({ page, browser }) => {
  await signIn(page, "platform@cartforge.test");
  await page.getByRole("searchbox", { name: "Search stores" }).fill(EMAIL);
  await page.getByRole("button", { name: `Password reset link for ${EMAIL}` }).click();
  const dialog = page.getByRole("dialog", { name: "Password reset link" });
  const link = dialog.getByRole("textbox", { name: "Reset link" });
  await expect(link).toHaveValue(/\/reset-password\?token=/);
  const url = new URL(await link.inputValue());

  const ctx = await browser.newContext();
  const merchant = await ctx.newPage();
  await merchant.goto(url.pathname + url.search);
  await expect(merchant.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await scan(merchant, "reset");
  await merchant
    .getByRole("textbox", { name: "New password", exact: true })
    .fill("third-Password-3");
  await merchant.getByLabel("Confirm new password").fill("third-Password-x");
  await merchant.getByRole("button", { name: "Save new password" }).click();
  await expect(merchant.getByText("The passwords don't match")).toBeVisible();
  await merchant.getByLabel("Confirm new password").fill("third-Password-3");
  await merchant.getByRole("button", { name: "Save new password" }).click();
  await expect(merchant.getByText("Your password has been changed")).toBeVisible();

  // The link works once.
  await merchant.goto(url.pathname + url.search);
  await merchant
    .getByRole("textbox", { name: "New password", exact: true })
    .fill("fourth-Password-4");
  await merchant.getByLabel("Confirm new password").fill("fourth-Password-4");
  await merchant.getByRole("button", { name: "Save new password" }).click();
  await expect(merchant.getByText(/invalid or has expired/)).toBeVisible();
  await expect(merchant.getByRole("link", { name: "Get a new link" })).toBeVisible();

  await merchant.context().clearCookies();
  await signIn(merchant, EMAIL, "third-Password-3");
  await expect(merchant).toHaveURL(/\/admin$/);
  await ctx.close();
});

test("a merchant signs out a device they don't use", async ({ page, browser }) => {
  // After the previous test Pat's password is third-Password-3.
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const phone = await ctx.newPage();
  await signIn(phone, EMAIL, "third-Password-3");

  await signIn(page, EMAIL, "third-Password-3");
  await page.goto("/admin/account");
  const devices = page.getByRole("list", { name: "Signed-in devices" });
  await expect(devices.getByText("This device")).toBeVisible();
  const iphone = devices.getByRole("listitem").filter({ hasText: "Safari on iOS" });
  await expect(iphone).toHaveCount(1);
  await scan(page, "devices");
  await iphone.getByRole("button", { name: /^Sign out Safari on iOS/ }).click();
  await expect(page.getByText("Signed out of that device")).toBeVisible();
  await expect(iphone).toHaveCount(0);

  await phone.goto("/admin");
  await expect(phone).toHaveURL(/\/login/);
  await ctx.close();
});

test("a broken or used confirmation link explains what to do", async ({ page }) => {
  await page.goto(`/verify-email?token=${"x".repeat(43)}`);
  await expect(page.getByText("We couldn't confirm your email")).toBeVisible();
  await scan(page, "verify-email");
  await expect(page.getByRole("link", { name: "Go to the admin" })).toBeVisible();
});
