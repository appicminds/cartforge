import AxeBuilder from "@axe-core/playwright";
import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/** Next 1: two-factor sign-in, end to end in the browser. */
const RUN = Date.now().toString(36);
const EMAIL = `mfa-${RUN}@example.com`;
const PASSWORD = "two-Factor-pass-1";

function base32(s: string): Buffer {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let v = 0;
  const out: number[] = [];
  for (const ch of s) {
    v = (v << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((v >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
/** What an authenticator app shows `offset` 30-second steps from now. */
function totp(secret: string, offset = 0): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac("sha1", base32(secret)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, "0");
}
async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    label,
  ).toEqual([]);
}
async function passwordStep(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("Authentication code")).toBeVisible();
}

test.describe.configure({ mode: "serial" });
let secret = "";
let recovery: string[] = [];

test("turning on two-factor sign-in", async ({ page }) => {
  const res = await page.request.post("/api/v1/auth/signup", {
    data: {
      name: "Mo Factor",
      email: EMAIL,
      password: PASSWORD,
      store_name: `Mo Shop ${RUN}`,
      currency: "USD",
    },
  });
  expect(res.ok()).toBe(true);
  await page.goto("/admin/account");
  await page.getByRole("button", { name: "Turn on two-factor sign-in" }).click();
  const dialog = page.getByRole("dialog", { name: "Turn on two-factor sign-in" });
  await expect(
    dialog.getByRole("img", { name: "QR code for your authenticator app" }),
  ).toBeVisible();
  await scan(page, "setup");
  secret = (await dialog.getByTestId("mfa-secret").textContent())!.trim();

  await dialog.getByLabel("6-digit code").fill("000000");
  await dialog.getByRole("button", { name: "Turn on" }).click();
  await expect(dialog.getByText("Incorrect code")).toBeVisible();
  await dialog.getByLabel("6-digit code").fill(totp(secret));
  await dialog.getByRole("button", { name: "Turn on" }).click();

  const codes = page.getByRole("dialog", { name: "Save your recovery codes" });
  await expect(codes.getByRole("listitem")).toHaveCount(10);
  recovery = (
    await codes
      .getByRole("list", { name: "Recovery codes" })
      .getByRole("listitem")
      .allTextContents()
  ).map((c) => c.trim());
  expect(recovery).toHaveLength(10);
  await codes.getByRole("button", { name: "I've saved them" }).click();
  await expect(page.getByText("10 recovery codes left")).toBeVisible();
});

test("signing in asks for the code", async ({ page }) => {
  await passwordStep(page);
  await scan(page, "code step");
  await page.getByLabel("Authentication code").fill("123456");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByText("Incorrect code")).toBeVisible();
  // The next step's code: valid (clock drift) and not used during setup.
  await page.getByLabel("Authentication code").fill(totp(secret, 1));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("a recovery code works once, then two-factor can be turned off", async ({ page }) => {
  await passwordStep(page);
  await page.getByLabel("Authentication code").fill(recovery[0]!);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/account");
  await expect(page.getByText("9 recovery codes left")).toBeVisible();
  await page.getByRole("button", { name: "Turn off" }).click();
  const dialog = page.getByRole("dialog", { name: "Turn off two-factor sign-in?" });
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByLabel("Authentication or recovery code").fill(recovery[1]!);
  await dialog.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("Two-factor sign-in is off")).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on two-factor sign-in" })).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
});
