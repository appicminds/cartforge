/** Test environment: a dedicated database derived from DATABASE_URL (…/cartforge → …/cartforge_test). */
const base =
  process.env.DATABASE_URL ??
  "postgresql://cartforge:cartforge@localhost:5432/cartforge?schema=public";

function testDbUrl(url: string): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const u = new URL(url);
  const name = u.pathname.replace(/^\//, "");
  u.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
  return u.toString();
}

/** Tests flush Redis, so always use a dedicated logical DB (15), never the dev one. */
function testRedisUrl(url: string): string {
  const u = new URL(url);
  u.pathname = "/15";
  return u.toString();
}

export const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: testDbUrl(base),
  REDIS_URL: testRedisUrl(process.env.REDIS_URL ?? "redis://localhost:6379"),
  API_PORT: "4999", // unused: supertest binds an ephemeral port
  ADMIN_ORIGIN: "http://localhost:3000",
  SESSION_SECRET: "test-session-secret-0123456789-abcdefghijklmnop",
  SESSION_TTL_HOURS: "1",
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

export function applyTestEnv(): void {
  Object.assign(process.env, TEST_ENV);
}
