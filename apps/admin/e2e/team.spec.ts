import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/** Next 1: Settings → Team, invitations and accepting them. */
const RUN = Date.now().toString(36);
const NEWBIE = `newbie-${RUN}@example.com`;

async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    label,
  ).toEqual([]);
}

async function invite(page: Page, email: string, role: string): Promise<string> {
  await page.getByRole("button", { name: "Invite someone" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite someone" });
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Role").selectOption({ label: role });
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  const created = page.getByRole("dialog", { name: "Invitation created" });
  const url = await created.getByRole("textbox", { name: "Invitation link" }).inputValue();
  await created.getByRole("button", { name: "Done" }).click();
  const u = new URL(url);
  return u.pathname + u.search;
}

test.describe.configure({ mode: "serial" });

test("an admin invites a new person, who creates an account and joins", async ({
  page,
  browser,
}) => {
  await signIn(page, "admin@cartforge.test");
  await page.getByRole("link", { name: "Team" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Team" })).toBeVisible();
  const members = page.getByRole("list", { name: "Team members" });
  await expect(
    members.getByRole("listitem").filter({ hasText: "owner@cartforge.test" }),
  ).toContainText("Owner");
  await scan(page, "team");

  const link = await invite(page, NEWBIE, "Catalog Manager");
  await expect(page.getByRole("list", { name: "Open invitations" })).toContainText(NEWBIE);

  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(link);
  await expect(
    guest.getByText(/invited .* to help run Northwind Goods as Catalog Manager/),
  ).toBeVisible();
  await scan(guest, "invite");
  await guest.getByLabel("Your name").fill("Nina Newbie");
  await guest.getByLabel("Choose a password").fill("welcome-Aboard-1");
  await guest.getByRole("button", { name: "Create account and join" }).click();
  await expect(guest).toHaveURL(/\/admin$/);
  await expect(guest.getByTestId("current-store")).toHaveText("Northwind Goods");
  await expect(guest.getByRole("link", { name: "Products" })).toBeVisible();
  // Catalog managers don't manage the team.
  await expect(guest.getByRole("link", { name: "Team" })).toHaveCount(0);
  await ctx.close();

  await page.reload();
  const row = members.getByRole("listitem").filter({ hasText: NEWBIE });
  await row.getByLabel("Role for Nina Newbie").selectOption({ label: "Order Manager" });
  await expect(page.getByText("Nina Newbie's role updated")).toBeVisible();
  await row.getByRole("button", { name: "Remove Nina Newbie" }).click();
  await page
    .getByRole("dialog", { name: "Remove Nina Newbie?" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(members).not.toContainText(NEWBIE);
});

test("an existing account signs in to accept, and invitations can be cancelled", async ({
  page,
  browser,
}) => {
  await signIn(page, "admin@cartforge.test");
  await page.goto("/admin/settings/team");
  const link = await invite(page, "other@cartforge.test", "Order Manager");

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto(link);
  await other.getByRole("link", { name: "Sign in as other@cartforge.test" }).click();
  await other.getByLabel("Email").fill("other@cartforge.test");
  await other.getByLabel("Password").fill("CartForge!dev1");
  await other.getByRole("button", { name: "Sign in" }).click();
  await other.getByRole("button", { name: "Join Northwind Goods" }).click();
  await expect(other).toHaveURL(/\/admin$/);
  await expect(other.getByTestId("current-store")).toHaveText("Northwind Goods");
  await ctx.close();

  // Put things back: other@ owns Harbor only in other tests.
  await page.reload();
  const row = page.getByRole("list", { name: "Team members" }).getByRole("listitem").filter({
    hasText: "other@cartforge.test",
  });
  await row.getByRole("button", { name: /^Remove / }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("list", { name: "Team members" })).not.toContainText(
    "other@cartforge.test",
  );

  await invite(page, `cancel-${RUN}@example.com`, "Order Manager");
  await page
    .getByRole("button", { name: `Cancel invitation for cancel-${RUN}@example.com` })
    .click();
  await expect(page.getByText("Invitation cancelled")).toBeVisible();
});
