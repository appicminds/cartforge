import { execFileSync } from "node:child_process";
import path from "node:path";
import { applyTestEnv, TEST_ENV } from "./test-env";

/**
 * Bring the dedicated test database up to date (non-destructive) and upsert seed
 * data. Tests must not depend on an empty database, only on seeded records.
 */
export default async function setup(): Promise<void> {
  applyTestEnv();
  const dbPkg = path.resolve(__dirname, "../../../packages/database");
  const env = { ...process.env, ...TEST_ENV };
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: dbPkg,
    env,
    stdio: "pipe",
  });
  const { seed } = await import("@cartforge/database/seed");
  await seed(TEST_ENV.DATABASE_URL);
}
