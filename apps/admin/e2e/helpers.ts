import { expect, type Page } from "@playwright/test";

export const PASSWORD = "CartForge!dev1";

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for the post-login redirect so callers can navigate immediately.
  await page.waitForURL(/\/admin(\/|\?|$)/);
}

export async function expectStore(page: Page, name: string) {
  await expect(page.getByTestId("store-settings")).toContainText(name);
}

/** Shopify-style store choice: from "Your stores", open one by name. */
export async function openStore(page: Page, name: string) {
  if (!/\/admin\/stores$/.test(page.url())) await page.goto("/admin/stores");
  await page.getByRole("button", { name: `Open ${name}` }).click();
  await page.waitForURL(/\/admin$/);
  await expect(page.getByTestId("current-store")).toHaveText(name);
}
