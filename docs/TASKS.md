# CartForge — Task Breakdown (Products milestone)

Format per PRD §28.1. Status: ☐ todo · ◐ in progress · ☑ done.
Permissions referenced use the catalog in `packages/types/src/permissions.ts`.

---

## Sprint 0 — Engineering foundation

| ID    | Task                                                                                                                                                                                              | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S0-01 | Monorepo: pnpm workspaces, Turborepo, TS base config, ESLint, Prettier, `.editorconfig`                                                                                                           | ☑     |
| S0-02 | Local stack: `docker-compose.yml` (Postgres 16, Redis 7, MinIO), `.env.example`                                                                                                                   | ☑     |
| S0-03 | `packages/config`: Zod-validated environment loader, fail-fast on bad config                                                                                                                      | ☑     |
| S0-04 | `packages/database`: Prisma schema for Identity + Store + Audit domains, first migration, client export                                                                                           | ☑     |
| S0-05 | `packages/types` + `packages/validation`: permission catalog, system roles, error/pagination contracts, auth schemas                                                                              | ☑     |
| S0-06 | API skeleton: NestJS app, `/api/v1` prefix, request IDs, Pino logging w/ redaction, global error filter + envelope, Zod validation pipe, OpenAPI `/api/docs`                                      | ☑     |
| S0-07 | Health: `/api/v1/health` (liveness) and `/api/v1/health/ready` (DB + Redis)                                                                                                                       | ☑     |
| S0-08 | Auth foundation: Argon2id, login/logout/me, DB sessions (hashed token), cookie flags, CSRF double-submit                                                                                          | ☑     |
| S0-09 | Authorization primitives: `SessionGuard`, `StoreScopeGuard` (`X-Store-Id` + membership), `PermissionsGuard` + `@RequirePermissions`                                                               | ☑     |
| S0-10 | Protected sample endpoint: `GET /api/v1/store` (store settings for current scope)                                                                                                                 | ☑     |
| S0-11 | Audit log service (actor, action, resource, before/after) used by login/logout                                                                                                                    | ☑     |
| S0-12 | Worker skeleton: BullMQ worker, health queue, graceful shutdown                                                                                                                                   | ☑     |
| S0-13 | `packages/ui`: design tokens (color, type, spacing, radius, shadow, z-index, breakpoints) + base components (Button, Input, Label, Card, Alert, Skeleton, Badge, PageHeader, EmptyState, Spinner) | ☑     |
| S0-14 | Admin app: Next.js, `/api` rewrite, API client (request IDs, CSRF, error normalization), TanStack Query provider                                                                                  | ☑     |
| S0-15 | Admin login screen (RHF + Zod, server error mapping)                                                                                                                                              | ☑     |
| S0-16 | Admin shell: collapsible sidebar, mobile drawer, top bar, breadcrumbs, store switcher, profile menu/logout, route guard                                                                           | ☑     |
| S0-17 | Seed: 2 stores, owner/admin/catalog-manager/order-manager users, cross-store membership for isolation tests                                                                                       | ☑     |
| S0-18 | Tests: unit (permissions, env), API integration (auth, CSRF, store isolation, permission denial), Playwright E2E for exit gate                                                                    | ☑     |
| S0-19 | CI: GitHub Actions — install, lint, typecheck, migrate, unit/integration tests, build                                                                                                             | ☑     |

**Exit gate:** seeded user logs in → protected admin route renders → `GET /api/v1/store`
with a valid `X-Store-Id` succeeds; a store the user isn't a member of returns 403.

**Status: ☑ passed (2026-11-19).** Evidence: `apps/api/test/store-scope.e2e.test.ts`,
`apps/admin/e2e/auth-shell.spec.ts`. 41 unit/integration tests + 7 Playwright tests green.

Known follow-ups carried into Sprint 1:

- OpenAPI request/response bodies are not yet schema-annotated (paths, tags, headers
  and auth are). Generate schemas from the shared Zod contracts when product DTOs land.
- `docker-compose.yml` was validated by CI-equivalent local services (Postgres 16,
  Redis 7) but not yet run under Docker itself; MinIO is unused until Sprint 2.
- Readiness check does not yet include the worker heartbeat key.
- Sentry-compatible error reporting is stubbed to `console.error` (route + request ID only).

---

## Sprint 1 — Product catalog foundation

| ID    | Task                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-01 | DB: `products` (+ `product_variants` default variant for simple products), indexes on `(store_id, handle)`, `(store_id, status)`, trigram/FTS index on title; soft delete |
| S1-02 | Validation: product create/update Zod schemas (title 1–200 trimmed, handle rules, status enum, type enum)                                                                 |
| S1-03 | Handle generation + uniqueness per store (409 `PRODUCT_HANDLE_TAKEN`)                                                                                                     |
| S1-04 | API: `POST/GET/PATCH /api/v1/products`, `GET /api/v1/products/:id` — perms `products.read` / `products.write`                                                             |
| S1-05 | API: list with page pagination, search (title/SKU/barcode), filters (status, type), sort (title, created, updated, status)                                                |
| S1-06 | HTML sanitization for description (server)                                                                                                                                |
| S1-07 | Admin: product list (table, search debounce, filters in URL, sort, pagination, empty/no-results/loading/error states)                                                     |
| S1-08 | Admin: product form — Basic info card (title, Tiptap description, type, vendor, status, handle), sticky save bar, unsaved-changes guard                                   |
| S1-09 | Shared server-error → form-field mapping                                                                                                                                  |
| S1-10 | Tests: product rules unit tests; API authz + cross-store isolation; E2E create→list→edit→refresh                                                                          |
| S1-11 | Audit log entries for product create/update                                                                                                                               |

**Exit gate:** PRD §27.2.

## Sprint 2 — Media & pricing

| ID    | Task                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| S2-01 | DB: `media_assets`, `media_derivatives`, `media_references`, `product_media`                                                          |
| S2-02 | Storage adapter interface; local-disk + S3/MinIO drivers                                                                              |
| S2-03 | Upload API (`POST /api/v1/media`): MIME sniffing, size/dimension limits, no SVG in v1                                                 |
| S2-04 | Worker job: sharp thumbnails/responsive derivatives                                                                                   |
| S2-05 | `GET /api/v1/media` search/list; delete with reference check (409 `MEDIA_IN_USE`)                                                     |
| S2-06 | Admin: FileUploader (drag-drop, progress, retry), product gallery (reorder, primary, alt text), media picker                          |
| S2-07 | Pricing: price/compare-at/cost minor units, taxable, tax class placeholder; compare-at > price rule; cost never in public serializers |
| S2-08 | Admin: Pricing card with currency-aware money input                                                                                   |
| S2-09 | Tests: file validation, price validation, restart persistence                                                                         |

## Sprint 3 — Variants & inventory

| ID    | Task                                                                                                                                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-01 | DB: `product_options`, `product_option_values`, `product_variant_option_values`, `inventory_locations`, `inventory_levels`, `stock_movements` |
| S3-02 | Variant generation service: cartesian preview, limits, uniqueness, explicit reconciliation (never overwrite existing variants)                |
| S3-03 | APIs: `POST /products/:id/variants`, `PATCH /variants/:id`, simple↔variable conversion rules                                                 |
| S3-04 | SKU uniqueness across store (partial unique index where SKU not null)                                                                         |
| S3-05 | Inventory adjustment API with `SELECT … FOR UPDATE`, immutable movement rows                                                                  |
| S3-06 | Admin: options editor, generation preview, variant table, bulk edit                                                                           |
| S3-07 | Admin: inventory overview + adjustment dialog, low-stock badges                                                                               |
| S3-08 | Tests: generation, SKU conflicts, concurrent adjustments                                                                                      |

## Sprint 4 — Organization, SEO & publishing

| ID    | Task                                                                                        |
| ----- | ------------------------------------------------------------------------------------------- |
| S4-01 | Categories: CRUD, parent-child with depth limit, cycle prevention, delete with reassignment |
| S4-02 | Manual collections: CRUD, `PUT /collections/:id/products` with ordering                     |
| S4-03 | Tags: normalized, assign/remove                                                             |
| S4-04 | SEO fields + search preview; published-handle change confirmation/redirect record           |
| S4-05 | Publish/archive endpoints with validation errors that are actionable                        |
| S4-06 | Bulk actions: publish, unpublish, archive, delete, add/remove category/collection           |
| S4-07 | Public catalog API (`/api/v1/storefront/products`) — active only, public fields only        |
| S4-08 | Admin: categories & collections screens; organization card; SEO card; row menus             |
| S4-09 | Duplicate product (controlled media/variant copy)                                           |
| S4-10 | Cache invalidation event hook (outbox entry) on storefront-affecting changes                |

## Sprint 5 — QA, hardening & release

| ID    | Task                                                               |
| ----- | ------------------------------------------------------------------ |
| S5-01 | Full PRD §29.2 scenario suite (E2E + integration)                  |
| S5-02 | Minimal `order_items` snapshot + immutability test                 |
| S5-03 | Large-catalog performance test (pagination/search on 50k products) |
| S5-04 | Accessibility (axe) and responsive pass on all product screens     |
| S5-05 | Product activity history view                                      |
| S5-06 | API docs review, operator notes                                    |
| S5-07 | Regression run + product-owner acceptance                          |
