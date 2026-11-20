# Performance — Products Management

Measured 2026-11-20 with `RUN_PERF=1 pnpm --filter @cartforge/api exec vitest run test/perf`
(`apps/api/test/perf/catalog.perf.test.ts`).

**Data set:** one store with **50,000 products** — 1 in 6 variable with 3 variants
(≈ 66,700 variants), 20 categories, stock levels for every variant, ~85% active / 10% draft / 5% archived.

**Method:** requests go through the real NestJS app (auth, store scope, validation, serialization) to a
local PostgreSQL 16; 2 warm-up requests, then 15 measured requests per query. Times are full
round-trip in milliseconds. Hardware: the CI-sized development container (shared vCPU), so production
hardware will usually be faster. Re-run after schema or query changes; budgets are enforced by the test.

| Query                               | Matches | p50 ms | p95 ms | Budget ms |     |
| ----------------------------------- | ------- | ------ | ------ | --------- | --- |
| products page 1 (updated desc)      | 50000   | 87     | 111    | 300       | ✅  |
| products page 1,999 (offset 49,950) | 50000   | 119    | 140    | 500       | ✅  |
| products search 'linen'             | 6250    | 196    | 260    | 400       | ✅  |
| products search SKU                 | 1       | 145    | 271    | 400       | ✅  |
| products status=active sort=title   | 42353   | 99     | 121    | 300       | ✅  |
| products by category                | 2485    | 60     | 76     | 300       | ✅  |
| inventory stock=low                 | 6221    | 86     | 105    | 400       | ✅  |
| inventory search                    | 10416   | 306    | 373    | 400       | ✅  |
| storefront products                 | 42353   | 36     | 42     | 300       | ✅  |
| storefront price_asc                | 42353   | 190    | 289    | 500       | ✅  |
| storefront category                 | 2099    | 39     | 46     | 400       | ✅  |

**Why it holds up**

- Composite indexes on `(store_id, status, updated_at)`, `(store_id, updated_at)`, `(store_id, created_at)`,
  `(store_id, title)`; trigram GIN indexes for title and SKU search.
- Stable ordering (`sort, id`) keeps deep pagination correct; offset 49,950 still returns in ~140 ms.
- Storefront listing selects ids first, then loads one page of products with their relations.

**Follow-ups**

- Inventory search (`OR` across product title, variant title and SKU) is closest to budget. If catalogs grow
  past ~100k variants, add a trigram index on `product_variants.title` or a denormalized search column.
- For very large catalogs, switch admin tables to keyset (cursor) pagination (PRD Appendix B allows both).
