/**
 * Large-catalog performance (PRD §29.1 performance tests, §30 "list endpoints paginated and indexed").
 * Opt-in: RUN_PERF=1 pnpm --filter @cartforge/api test -- test/perf
 * Seeds 50,000 products (8,000 of them variable with 3 variants) into a dedicated store once,
 * then measures API latency (p50/p95 over repeated requests) against budgets.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { createTestApp, login, type Session } from "../app";
import { TEST_ENV } from "../test-env";

const PERF_STORE = "00000000-0000-4000-8000-0000000000aa";
const N = 50_000;
const RUNS = 15;

const pct = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]!;

describe.skipIf(!process.env.RUN_PERF)("catalog performance (50k products)", () => {
  let app: INestApplication;
  let s: Session;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  const results: { name: string; p50: number; p95: number; budget: number; total?: number }[] = [];
  let categoryId = "";

  beforeAll(async () => {
    const existing = await prisma.product.count({ where: { store_id: PERF_STORE } });
    if (existing < N) await seed();
    categoryId = (
      await prisma.category.findFirstOrThrow({
        where: { store_id: PERF_STORE, handle: "perf-cat-3" },
      })
    ).id;
    app = await createTestApp();
    s = await login(app, "admin@cartforge.test");
  }, 600_000);

  afterAll(async () => {
    const out = path.resolve(__dirname, "../../perf-results.json");
    writeFileSync(
      out,
      JSON.stringify({ products: N, runs: RUNS, at: new Date().toISOString(), results }, null, 2),
    );
    await prisma.$disconnect();
    await app?.close();
  });

  async function seed() {
    for (const stmt of [
      `INSERT INTO stores (id, name, currency, updated_at) VALUES ('${PERF_STORE}', 'Perf Store', 'USD', now())
         ON CONFLICT (id) DO NOTHING`,
      `INSERT INTO inventory_locations (id, store_id, name, is_default, updated_at)
         SELECT gen_random_uuid(), '${PERF_STORE}', 'Main location', true, now()
         WHERE NOT EXISTS (SELECT 1 FROM inventory_locations WHERE store_id='${PERF_STORE}' AND is_default)`,
      `INSERT INTO roles (id, store_id, key, name, is_system, permissions, updated_at)
         SELECT gen_random_uuid(), '${PERF_STORE}', 'admin', 'Store Administrator', true, r.permissions, now()
         FROM roles r WHERE r.store_id = '00000000-0000-4000-8000-000000000001' AND r.key = 'admin'
         ON CONFLICT (store_id, key) DO NOTHING`,
      `INSERT INTO store_memberships (id, store_id, user_id, role_id, updated_at)
         SELECT gen_random_uuid(), '${PERF_STORE}', u.id, r.id, now()
         FROM users u, roles r WHERE u.email='admin@cartforge.test' AND r.store_id='${PERF_STORE}' AND r.key='admin'
         ON CONFLICT (store_id, user_id) DO NOTHING`,
    ]) {
      await prisma.$executeRawUnsafe(stmt);
    }
    for (const stmt of [
      `DELETE FROM products WHERE store_id='${PERF_STORE}'`,
      `INSERT INTO categories (id, store_id, name, handle, updated_at)
         SELECT gen_random_uuid(), '${PERF_STORE}', 'Perf category ' || c, 'perf-cat-' || c, now() FROM generate_series(1, 20) c
         ON CONFLICT (store_id, handle) DO NOTHING`,
      `INSERT INTO products (id, store_id, title, handle, product_type, vendor, status, published_at, created_at, updated_at, description_html)
         SELECT gen_random_uuid(), '${PERF_STORE}',
           (ARRAY['Cotton','Linen','Wool','Silk','Denim','Leather','Bamboo','Cedar'])[1 + i % 8] || ' ' ||
           (ARRAY['Shirt','Mug','Lamp','Rug','Chair','Tee','Scarf','Bowl','Candle','Throw'])[1 + i % 10] || ' ' || i,
           'perf-' || i,
           CASE WHEN i % 6 = 0 THEN 'variable'::"ProductType" ELSE 'simple'::"ProductType" END,
           'Vendor ' || (i % 50),
           CASE WHEN i % 10 = 0 THEN 'draft'::"ProductStatus" WHEN i % 17 = 0 THEN 'archived'::"ProductStatus" ELSE 'active'::"ProductStatus" END,
           now() - (i || ' minutes')::interval, now() - (i || ' minutes')::interval, now() - ((i % 997) || ' minutes')::interval,
           '<p>Perf product ' || i || '</p>'
         FROM generate_series(1, ${N}) i`,
      `INSERT INTO product_variants (id, store_id, product_id, title, sku, position, price_minor, currency, option_signature, updated_at)
         SELECT gen_random_uuid(), p.store_id, p.id, CASE WHEN p.product_type='variable' THEN 'Size ' || v ELSE 'Default' END,
           'SKU-' || substr(p.handle, 6) || CASE WHEN p.product_type='variable' THEN '-' || v ELSE '' END,
           v - 1, 500 + (abs(hashtext(p.handle)) % 20000) + v * 100, 'USD',
           CASE WHEN p.product_type='variable' THEN 'perf-' || v ELSE '' END, now()
         FROM products p CROSS JOIN generate_series(1, 3) v
         WHERE p.store_id='${PERF_STORE}' AND (p.product_type='variable' OR v = 1)`,
      `INSERT INTO inventory_levels (id, store_id, variant_id, location_id, on_hand, low_stock_threshold, updated_at)
         SELECT gen_random_uuid(), v.store_id, v.id, l.id, abs(hashtext(v.id::text)) % 40, CASE WHEN v.position = 0 THEN 5 END, now()
         FROM product_variants v JOIN inventory_locations l ON l.store_id = v.store_id AND l.is_default
         WHERE v.store_id='${PERF_STORE}'`,
      `INSERT INTO product_categories (product_id, category_id, store_id)
         SELECT p.id, c.id, p.store_id FROM products p
         JOIN categories c ON c.store_id = p.store_id AND c.handle = 'perf-cat-' || (1 + abs(hashtext(p.handle)) % 20)
         WHERE p.store_id='${PERF_STORE}'`,
      `ANALYZE products`,
      `ANALYZE product_variants`,
      `ANALYZE inventory_levels`,
      `ANALYZE product_categories`,
    ]) {
      await prisma.$executeRawUnsafe(stmt);
    }
  }

  async function measure(name: string, url: string, budget: number, publicApi = false) {
    const times: number[] = [];
    let total: number | undefined;
    for (let i = 0; i < RUNS + 2; i++) {
      const t0 = performance.now();
      const res = await (publicApi
        ? request(app.getHttpServer()).get(url).set("X-Store-Id", PERF_STORE)
        : request(app.getHttpServer())
            .get(url)
            .set("Cookie", s.cookies)
            .set("X-Store-Id", PERF_STORE));
      const ms = performance.now() - t0;
      expect(res.status, `${name}: ${JSON.stringify(res.body).slice(0, 200)}`).toBe(200);
      total = res.body.meta?.total;
      if (i >= 2) times.push(ms); // first two are warm-up
    }
    const row = {
      name,
      p50: Math.round(pct(times, 50)),
      p95: Math.round(pct(times, 95)),
      budget,
      total,
    };
    results.push(row);
    expect(row.p95, `${name} p95 ${row.p95}ms > ${budget}ms`).toBeLessThanOrEqual(budget);
  }

  it("admin product list: first page, default sort", () =>
    measure("products page 1 (updated desc)", "/api/v1/products?page_size=25", 300));
  it("admin product list: deep page", () =>
    measure("products page 1,999 (offset 49,950)", "/api/v1/products?page_size=25&page=1999", 500));
  it("admin product list: title search", () =>
    measure("products search 'linen'", "/api/v1/products?q=linen&page_size=25", 400));
  it("admin product list: exact SKU search", () =>
    measure("products search SKU", "/api/v1/products?q=SKU-31415&page_size=25", 400));
  it("admin product list: status filter + title sort", () =>
    measure(
      "products status=active sort=title",
      "/api/v1/products?status=active&sort=title&order=asc&page_size=25",
      300,
    ));
  it("admin product list: category filter", () =>
    measure(
      "products by category",
      `/api/v1/products?category_id=${categoryId}&page_size=25`,
      300,
    ));
  it("inventory: low stock view", () =>
    measure("inventory stock=low", "/api/v1/inventory?stock=low&page_size=25", 400));
  it("inventory: search", () =>
    measure("inventory search", "/api/v1/inventory?q=Wool&page_size=25", 400));
  it("storefront: listing (public)", () =>
    measure("storefront products", "/api/v1/storefront/products?page_size=24", 300, true));
  it("storefront: price sort (public)", () =>
    measure(
      "storefront price_asc",
      "/api/v1/storefront/products?sort=price_asc&page_size=24",
      500,
      true,
    ));
  it("storefront: category subtree (public)", () =>
    measure(
      "storefront category",
      "/api/v1/storefront/products?category=perf-cat-3&page_size=24",
      400,
      true,
    ));
});
