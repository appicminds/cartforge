import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.ADMIN_PORT ?? 3000);

/**
 * E2E runs against a real API + database (FE-006: no mocks). Locally, start the
 * stack first (`pnpm dev`) or let webServer start built apps. CI builds first.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /responsive\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "node --env-file-if-exists=../../.env ../api/dist/main.js",
      url: "http://localhost:4000/api/v1/health/ready",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `npx next start --port ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
