import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/** Next 5 — Settings → Payments, and the wallet/Raast transfer method in Checkout settings. */
async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    label,
  ).toEqual([]);
}

test("connect Stripe in test mode; secrets are never shown again", async ({ page }) => {
  await signIn(page, "admin@cartforge.test");
  await page.getByRole("link", { name: "Payments" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Payments" })).toBeVisible();
  const cards = page.getByRole("list", { name: "Payment providers" });
  for (const name of ["Safepay", "JazzCash", "Easypaisa", "Stripe"])
    await expect(cards.getByRole("heading", { name, exact: true })).toBeVisible();
  await scan(page, "payments");

  // Start clean if an earlier run left Stripe connected.
  const disconnect = page.getByRole("button", { name: "Disconnect Stripe" });
  if (await disconnect.count()) {
    await disconnect.click();
    await page.getByRole("dialog").getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByRole("button", { name: "Connect Stripe" })).toBeVisible();
  }

  await page.getByRole("button", { name: "Connect Stripe" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect Stripe" });
  await dialog.getByLabel("Secret key").fill("sk_live_wrongmode");
  await dialog.getByLabel("Webhook signing secret").fill("whsec_e2e");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Should start with sk_test_")).toBeVisible();
  await dialog.getByLabel("Secret key").fill("sk_test_e2e_secret");
  await scan(page, "connect dialog");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Stripe saved")).toBeVisible();

  const stripe = cards
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Stripe" }) });
  await expect(stripe.getByText("Test mode")).toBeVisible();
  await page.getByRole("button", { name: "Edit Stripe" }).click();
  const edit = page.getByRole("dialog", { name: "Edit Stripe" });
  await expect(edit.getByLabel("Secret key")).toHaveValue(""); // write-only
  await expect(edit.getByText("Saved. Leave empty to keep it.").first()).toBeVisible();
  await expect(edit.getByRole("textbox", { name: "Notification (webhook / IPN) URL" })).toHaveValue(
    /\/api\/v1\/payments\/webhooks\/stripe\/[0-9a-f-]{36}$/,
  );
  await edit.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Disconnect Stripe" }).click();
  await page
    .getByRole("dialog", { name: "Disconnect Stripe?" })
    .getByRole("button", { name: "Disconnect" })
    .click();
  await expect(page.getByText("Stripe disconnected")).toBeVisible();
});

test("catalog managers can't open payment settings for editing", async ({ page }) => {
  await signIn(page, "catalog@cartforge.test");
  await page.goto("/admin/settings/payments");
  await expect(page.getByText("Only the store owner or an administrator")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Connect / })).toHaveCount(0);
});

test("wallet / Raast transfer in checkout settings", async ({ page }) => {
  await signIn(page, "admin@cartforge.test");
  await page.goto("/admin/settings/checkout");
  const toggle = page.getByLabel(/JazzCash, Easypaisa or Raast transfer/);
  if (!(await toggle.isChecked())) await toggle.check();
  await page.getByLabel("JazzCash number").fill("12345");
  await page.getByLabel("IBAN").fill("PK00");
  await page.getByLabel("Account title").fill("");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Use a mobile number like 0300 1234567")).toBeVisible();
  await expect(page.getByText(/Use an IBAN like/)).toBeVisible();
  await page.getByLabel("JazzCash number").fill("0300 1234567");
  await page.getByLabel("IBAN").fill("PK36 SCBL 0000 0011 2345 6702");
  await page.getByLabel("Account title").fill("Northwind Goods");
  await scan(page, "wallet settings");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("JazzCash number")).toHaveValue("03001234567");
  // Leave the shared demo store as other tests expect it.
  await page.getByLabel(/JazzCash, Easypaisa or Raast transfer/).uncheck();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
});
