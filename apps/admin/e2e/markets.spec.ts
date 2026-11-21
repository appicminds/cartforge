import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

const RUN = Date.now().toString(36);

async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    label,
  ).toEqual([]);
}

/** Markets: add a Gulf market in AED to a PKR store, fix one product's price there. */
test("add a market with its own rate, then fix a product's price in it", async ({ page }) => {
  await signIn(page, "other@cartforge.test");
  await page.goto("/admin/stores");
  await page.getByRole("button", { name: "Create store" }).click();
  const create = page.getByRole("dialog", { name: /Create/ });
  await create.getByLabel("Store name").fill(`Silsila Intl ${RUN}`);
  await create.getByLabel("Currency").selectOption("PKR");
  await create.getByRole("button", { name: "Create store" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const storeId = await page.evaluate(() => localStorage.getItem("cf:active-store"));
  const csrf = (await page.context().cookies()).find((c) => c.name === "cf_csrf")!.value;
  const res = await page.request.post("/api/v1/products", {
    data: { title: `Lawn Suit ${RUN}`, price_minor: 4799, status: "active" },
    headers: { "X-CSRF-Token": csrf, "X-Store-Id": storeId! },
  });
  const product = (await res.json()).data as { id: string };

  await page.getByRole("link", { name: "Markets" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Markets" })).toBeVisible();
  const list = page.getByRole("list", { name: "Markets" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText("Pakistan");
  await expect(page.getByText("Selling abroad?")).toBeVisible();

  await page.getByRole("button", { name: "Add market" }).click();
  const dialog = page.getByRole("dialog", { name: "Add market" });
  await dialog.getByLabel("Market name").fill("Gulf");
  await dialog.getByLabel("Currency").selectOption("AED");
  await dialog.getByLabel(/^Countries/).fill("ae, sa");
  await expect(dialog.getByText("United Arab Emirates, Saudi Arabia")).toBeVisible();
  await dialog.getByLabel(/^1 AED equals/).fill("76");
  await expect(dialog.getByTestId("market-example")).toContainText("AED 63.99");
  // Rupee-only methods can't be offered in AED.
  await expect(
    dialog.getByRole("checkbox", { name: /JazzCash, Easypaisa or Raast transfer/ }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Cash on delivery" }).check();
  await scan(page, "market dialog");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Gulf added")).toBeVisible();
  const gulf = list.getByRole("listitem").filter({ hasText: "Gulf" });
  await expect(gulf).toContainText("1 AED = 76 PKR · your rate");
  await expect(gulf).toContainText("United Arab Emirates, Saudi Arabia");
  await expect(gulf).toContainText("Cash on delivery");
  await scan(page, "markets page");

  // A country can only be in one market.
  await page.getByRole("button", { name: "Add market" }).click();
  const again = page.getByRole("dialog", { name: "Add market" });
  await again.getByLabel("Market name").fill("UAE only");
  await again.getByLabel("Currency").selectOption("AED");
  await again.getByLabel(/^Countries/).fill("AE");
  await again.getByLabel(/^1 AED equals/).fill("75");
  await again.getByRole("button", { name: "Save" }).click();
  await expect(again.getByText("AE is already in Gulf")).toBeVisible();
  await again.getByRole("button", { name: "Cancel" }).click();

  // Product page: converted price shown; fix it by hand.
  await page.goto(`/admin/products/${product.id}`);
  await expect(page.getByLabel("Sell in Gulf (AED)")).toBeChecked();
  await expect(page.getByText("AED 63.99").first()).toBeVisible();
  await page.getByLabel("Fixed price in Gulf for Default").fill("59");
  await page.getByRole("button", { name: "Save markets" }).click();
  await expect(page.getByText("Market settings saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Fixed price in Gulf for Default")).toHaveValue("59.00");
});
