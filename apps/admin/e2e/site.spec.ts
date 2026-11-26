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
  for (const id of ["sell", "store-builder", "themes", "payments", "markets", "grow", "manage"])
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
  await expect(menu.getByRole("link")).toHaveCount(6);
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
