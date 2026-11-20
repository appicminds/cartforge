import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.STOREFRONT_PORT ?? 3100);

/**
 * Real API + database (no mocks). Tests create their own catalog data through the
 * admin API and check what shoppers see, including cache purges on change.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
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
      url: `http://localhost:${PORT}/robots.txt`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
