import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";
import { placeOrder } from "./order-helpers";

/** Next 6 — processing an order in the admin: pay, ship, deliver, refund, note, cancel. */
const RUN = `proc${Date.now().toString(36)}`;

async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    label,
  ).toEqual([]);
}
async function openOrder(page: Page, number: string) {
  await page.goto("/admin/orders");
  await page.getByRole("searchbox", { name: "Search orders" }).fill(number);
  await page.getByRole("link", { name: `#${number}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Order #${number}` })).toBeVisible();
}

test("ship in parts, record payment, refund one item and leave a note", async ({ page }) => {
  const order = await placeOrder(RUN, 2); // 2 × $42.00, cash on delivery
  await signIn(page, "admin@cartforge.test");
  await page.goto("/admin/orders?view=to_ship");
  await page.getByRole("searchbox", { name: "Search orders" }).fill(order.number);
  await expect(page.getByRole("link", { name: `#${order.number}` })).toBeVisible();
  await openOrder(page, order.number);
  await scan(page, "order");

  // Ship one of two, with tracking.
  await page.getByRole("button", { name: "Ship items" }).click();
  const ship = page.getByRole("dialog", { name: "Ship items" });
  await ship.getByLabel(order.title).fill("1");
  await ship.getByLabel("Carrier").fill("DHL");
  await ship.getByLabel("Tracking number").fill("JD0001");
  await ship.getByLabel("Tracking link").fill("https://track.example/JD0001");
  await scan(page, "ship dialog");
  await ship.getByRole("button", { name: "Ship 1 item" }).click();
  await expect(page.getByText("Shipped 1 of 2")).toBeVisible();
  const shipments = page.getByRole("list", { name: "Shipments" });
  await expect(shipments).toContainText("DHL JD0001");
  await expect(page.getByText("Partially fulfilled")).toBeVisible();
  await shipments.getByRole("button", { name: "Mark delivered, shipment 1" }).click();
  await expect(shipments.getByText("Delivered", { exact: true })).toBeVisible();

  // Cash collected on delivery.
  await page.getByRole("button", { name: "Mark as paid" }).click();
  const paid = page.getByRole("dialog", { name: "Record payment" });
  await paid.getByLabel("Reference").fill("Driver receipt 77");
  await paid.getByRole("button", { name: "Mark as paid" }).click();
  await expect(page.getByText("Payment recorded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as paid" })).toHaveCount(0);

  // The second one comes back unshipped: refund it, back into stock.
  await page.getByRole("button", { name: "Refund" }).click();
  const refund = page.getByRole("dialog", { name: "Refund" });
  await refund.getByLabel(order.title).fill("1");
  await expect(refund.getByLabel("Amount (USD)")).toHaveValue("42.00");
  await refund.getByLabel("Reason").fill("Changed their mind");
  await scan(page, "refund dialog");
  await refund.getByRole("button", { name: "Refund $42.00" }).click();
  await expect(page.getByText("Refund recorded")).toBeVisible();
  await expect(page.getByText("Partially refunded").first()).toBeVisible();
  await expect(page.getByText("−$42.00")).toBeVisible();
  // Everything left has shipped now.
  await expect(page.getByText("Fulfilled", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ship items" })).toHaveCount(0);

  await page.getByLabel("Add a note").fill("Customer kept the first lamp");
  await page.getByRole("button", { name: "Add note" }).click();
  const timeline = page.getByRole("list", { name: "Order timeline" });
  await expect(timeline.getByRole("listitem").first()).toContainText(
    "Customer kept the first lamp",
  );
  await expect(timeline.getByRole("listitem").first()).toContainText("Adam Admin");
  await expect(timeline).toContainText("Refunded $42.00 for 1 item — Changed their mind");
});

test("cancel an unpaid order", async ({ page }) => {
  const order = await placeOrder(RUN, 1);
  await signIn(page, "admin@cartforge.test");
  await openOrder(page, order.number);
  await page.getByRole("button", { name: "Cancel order" }).click();
  const dialog = page.getByRole("dialog", { name: `Cancel order #${order.number}?` });
  await dialog.getByLabel("Reason").selectOption({ label: "Items unavailable" });
  await scan(page, "cancel dialog");
  await dialog.getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByText(/^Canceled /)).toBeVisible();
  await expect(page.getByText("Reason: items unavailable.")).toBeVisible();
  for (const name of ["Ship items", "Mark as paid", "Cancel order"])
    await expect(page.getByRole("button", { name })).toHaveCount(0);

  await page.goto("/admin/orders?view=to_ship");
  await page.getByRole("searchbox", { name: "Search orders" }).fill(order.number);
  await expect(page.getByText("No orders match")).toBeVisible();
});

test("order managers can ship but not refund", async ({ page }) => {
  const order = await placeOrder(RUN, 1);
  await signIn(page, "orders@cartforge.test");
  await openOrder(page, order.number);
  await expect(page.getByRole("button", { name: "Ship items" })).toBeVisible();
  await page.getByRole("button", { name: "Mark as paid" }).click();
  await page
    .getByRole("dialog", { name: "Record payment" })
    .getByRole("button", { name: "Mark as paid" })
    .click();
  await expect(page.getByText("Payment recorded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refund" })).toHaveCount(0);
});
