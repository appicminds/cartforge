import { expect, test } from "@playwright/test";
import { expectStore, signIn } from "./helpers";

test.describe("Sprint 0 exit gate", () => {
  test("unauthenticated visitors are sent to login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
    await expect(page.getByRole("heading", { name: "Sign in to your store" })).toBeVisible();
  });

  test("a stale session cookie never renders protected data", async ({ page, context }) => {
    await context.addCookies([
      { name: "cf_session", value: "forged-token", url: "http://localhost:3000" },
    ]);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("store-settings")).toHaveCount(0);
  });

  test("shows field validation and server errors", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();

    await page.getByLabel("Email").fill("owner@cartforge.test");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Email or password is incorrect." }),
    ).toBeVisible();
  });

  test("seeded user logs in, sees store-scoped API data, switches store, signs out", async ({
    page,
  }) => {
    await signIn(page, "owner@cartforge.test");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Welcome, Olivia" })).toBeVisible();
    // Multi-store owner: stores are listed alphabetically; the first is the default.
    await expectStore(page, "Harbor Outfitters");
    await expectStore(page, "EUR");

    await page.getByLabel("Active store").selectOption({ label: "Northwind Goods" });
    await expectStore(page, "Northwind Goods");
    await expectStore(page, "USD");

    // Selection persists across reloads.
    await page.reload();
    await expectStore(page, "Northwind Goods");

    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("returns to the requested page after login", async ({ page }) => {
    await page.goto("/admin?from=deep-link");
    await expect(page).toHaveURL(/next=/);
    await page.getByLabel("Email").fill("catalog@cartforge.test");
    await page.getByLabel("Password").fill("CartForge!dev1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin\?from=deep-link$/);
    await expectStore(page, "Catalog Manager");
  });

  test("sidebar collapses and is keyboard reachable", async ({ page }) => {
    await signIn(page, "admin@cartforge.test");
    await expectStore(page, "Northwind Goods");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    await page.getByRole("button", { name: "Expand sidebar" }).click();
  });
});
