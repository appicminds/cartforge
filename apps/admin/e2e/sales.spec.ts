import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { API } from "./order-helpers";

const RUN = Date.now().toString(36).toUpperCase();
const STORE = "00000000-0000-4000-8000-000000000001";

async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    label,
  ).toEqual([]);
}

/** A product made through the API (sorted first in pickers). */
async function makeProduct(title: string, price: number): Promise<string> {
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ email: "owner@cartforge.test", password: "CartForge!dev1" }),
  });
  const cookies = login.headers.getSetCookie().map((c) => c.split(";")[0]!);
  const csrf = cookies.find((c) => c.startsWith("cf_csrf="))!.split("=")[1]!;
  const res = await fetch(`${API}/products`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookies.join("; "),
      "x-csrf-token": csrf,
      "x-store-id": STORE,
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({ title, price_minor: price, status: "active", inventory_quantity: 5 }),
  });
  const body = (await res.json()) as { data: { id: string } };
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body.data.id;
}

/** Discounts → Sales: review, run, see it on the product, end it and get the price back. */
test("run a sale on a product, then end it", async ({ page }) => {
  const title = `Aaa Sale Lamp ${RUN}`;
  const productId = await makeProduct(title, 4000);
  await signIn(page, "admin@cartforge.test");
  await page.getByRole("link", { name: "Discounts" }).click();
  await page
    .getByRole("navigation", { name: "Discounts" })
    .getByRole("link", { name: "Sales" })
    .click();
  await expect(page).toHaveURL(/\/admin\/discounts\/sales$/);
  await scan(page, "sales list");
  await page.getByRole("link", { name: "Run a sale" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Run a sale" })).toBeVisible();

  await page.getByRole("button", { name: "Review changes" }).click();
  await expect(page.getByText("Enter a name")).toBeVisible();
  await page.getByLabel(/^Name/).fill(`Lamp Week ${RUN}`);
  await page.getByLabel(/^Percentage off/).fill("25");
  await page.getByRole("radio", { name: "Specific products" }).check();
  await page.getByRole("button", { name: "Choose products" }).click();
  await page.getByRole("dialog").getByRole("checkbox", { name: title }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Rounding").selectOption("whole");
  await page.getByRole("button", { name: "Review changes" }).click();
  const review = page.getByTestId("sale-review");
  await expect(review).toContainText("1 product (1 variant) will change price.");
  await expect(page.getByRole("table", { name: "Example price changes" })).toContainText("$30.00");
  await scan(page, "sale editor with review");

  // Changing anything asks for a fresh review.
  await page.getByLabel(/^Percentage off/).fill("20");
  await expect(review).toBeHidden();
  await page.getByRole("button", { name: "Review changes" }).click();
  await page.getByRole("button", { name: "Start sale on 1 product" }).click();
  await expect(page.getByText("Sale started — prices updated")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Lamp Week ${RUN}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Running");
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toContainText("$40.00");
  await expect(row).toContainText("$32.00");
  await scan(page, "running sale");

  // The product page says so.
  await page.goto(`/admin/products/${productId}`);
  await expect(page.getByText(`In sale: Lamp Week ${RUN}`)).toBeVisible();

  // End it: the price comes back.
  await page.getByRole("link", { name: "View sale" }).click();
  await page.getByRole("button", { name: "End sale now" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "End sale" }).click();
  await expect(page.getByText("Sale ended — 1 prices restored")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ended");
  await expect(page.getByRole("row").filter({ hasText: title })).toContainText("Price restored");
  await page.goto(`/admin/products/${productId}`);
  await expect(page.getByText(`In sale: Lamp Week ${RUN}`)).toBeHidden();
  await expect(page.getByLabel(/^Price/).first()).toHaveValue("40.00");
});
