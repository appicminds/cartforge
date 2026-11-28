import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    label,
  ).toEqual([]);
}

test("home: hero, sections, accessible, sign-up carries the email", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/CartForge/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Make it\.\s*Sell it\.\s*Grow it\./,
  );
  // The admin showcase switches screens.
  await page.getByRole("tab", { name: "Orders" }).click();
  await expect(page.getByRole("tabpanel").getByRole("img")).toHaveAttribute("alt", /Orders/);
  for (const id of [
    "editions",
    "sell",
    "store-builder",
    "themes",
    "payments",
    "markets",
    "grow",
    "manage",
  ])
    await expect(page.locator(`#${id}`)).toBeVisible();
  await scan(page, "home");

  // The hero form goes to the app's sign-up page with the email.
  await page.getByLabel("Email address").first().fill("new.seller@example.com");
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/signup?")),
    page.getByRole("button", { name: "Start for free" }).first().click(),
  ]);
  expect(new URL(req.url()).searchParams.get("email")).toBe("new.seller@example.com");
});

test("Features menu opens, links to sections and closes with Escape", async ({ page }) => {
  await page.goto("/pricing");
  await page.getByRole("button", { name: "Features" }).click();
  const menu = page.locator("#features-menu");
  await expect(menu.getByRole("link")).toHaveCount(7);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await page.getByRole("button", { name: "Features" }).click();
  await menu.getByRole("link", { name: /Payments/ }).click();
  await expect(page).toHaveURL(/\/#payments$/);
});

test("pricing: monthly and yearly, comparison and FAQ", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pick the plan that fits");
  const starter = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Starter" }) });
  await expect(starter).toContainText("$14");
  await page.getByRole("radio", { name: "Monthly" }).click();
  await expect(starter).toContainText("$19");
  await expect(page.getByText("Free during beta").first()).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Scheduled sales");
  await page.getByText("Do I need a credit card to start?").click();
  await expect(page.getByText("Create your store with just your email")).toBeVisible();
  await scan(page, "pricing");
});

test("legal pages, sitemap and robots", async ({ page, request }) => {
  for (const [path, title] of [
    ["/legal/terms", "Terms of service"],
    ["/legal/privacy", "Privacy policy"],
    ["/legal/acceptable-use", "Acceptable use policy"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  }
  await scan(page, "legal");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/pricing");
  expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap:");
  await page.goto("/");
  const og = new URL((await page.locator('meta[property="og:image"]').getAttribute("content"))!);
  expect((await request.get(og.pathname + og.search)).headers()["content-type"]).toBe("image/png");
});

test("self-hosted page: one-time license, requirements, comparison", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Self-hosted" })
    .click();
  await expect(page).toHaveURL(/\/self-hosted$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /Your server\.\s*Your platform\./,
  );
  await expect(page.getByText("PostgreSQL 16")).toBeVisible();
  await expect(page.getByText("The full source code").first()).toBeVisible();
  const table = page.getByRole("table");
  await expect(table).toContainText("One-time license");
  await expect(table).toContainText("Monthly or yearly subscription");
  await expect(table).toContainText("Full source code, yours to change");
  await scan(page, "self-hosted");
});

test("pricing: Cloud plans or the self-hosted license", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("tab", { name: "Cloud · subscription" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Self-hosted · one time" }).click();
  const panel = page.getByRole("tabpanel");
  await expect(panel).toContainText("USD, one time");
  await expect(panel.getByRole("link", { name: "Get a license" })).toBeVisible();
  // A link to #self-hosted opens the license directly.
  await page.goto("/pricing#self-hosted");
  await expect(page.getByRole("tab", { name: "Self-hosted · one time" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
