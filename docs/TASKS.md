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

**Exit gate:** PRD §27.2 — create a simple draft, see it in the list, search it, open it,
edit it, and retrieve persisted changes after refresh.

**Status: ☑ all tasks done, exit gate passed (2026-11-19).** Evidence:
`apps/api/test/products.e2e.test.ts` (25 API cases incl. authz + cross-store isolation),
`apps/admin/e2e/products.spec.ts` (10 browser cases). Totals: 91 unit/integration + 17 E2E, green.

Delivered beyond the task list (pulled forward because they were cheap and safe):

- `DELETE /api/v1/products/:id` (soft delete, frees the handle) + row-menu and detail delete with confirmation.
- Status changes require `products.publish`; a minimal publish rule set (`publish-rules.ts`) that Sprint 2/3 extend.
- Changing a published product's handle requires explicit confirmation (`HANDLE_CHANGE_REQUIRES_CONFIRMATION`).
- Partial unique indexes so soft-deleted rows don't block handle/SKU reuse; `pg_trgm` indexes for search.
- UI kit additions: Select, Textarea, Table/SortableTh, Pagination, Dialog/ConfirmDialog (native `<dialog>`), Menu, Toast.

Notes / follow-ups:

- Bugs found and fixed during E2E: rich-text editor could drop keystrokes typed right after a toolbar
  click, and re-applied stale values mid-typing; the form's blank-vendor transform would have nulled
  vendor on every partial update (caught by unit tests before shipping).
- Unsaved-changes guard covers reload/close and in-app links; browser Back is not intercepted
  (App Router offers no cancelable navigation event).
- Link insertion uses `window.prompt` — replace with an inline popover (Sprint 4 polish).
- List columns for inventory, category and price arrive with Sprints 2–4; thumbnails with Sprint 2.
- Optimistic concurrency (stale-edit detection) not yet implemented; row locks serialize writes.

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

**Exit gate:** PRD §27.3 — a product can contain multiple uploaded images and valid pricing;
assets remain available after application restart.

**Status: ☑ all tasks done, exit gate passed (2026-11-19).** Evidence: `apps/api/test/media.e2e.test.ts`
(upload, dedupe, validation, size limit, traversal, ordering/primary, pricing rules, in-use deletion),
`apps/api/src/media/image-processor.test.ts`, `apps/admin/e2e/media-pricing.spec.ts`. Assets live in
object storage (local disk / S3 / Vercel Blob) and the database, so they survive restarts — the E2E
suite reloads pages against freshly restarted servers. Totals: 136 unit/integration + 23 E2E, green.

Decisions and deviations:

- **Derivatives are generated synchronously during upload** (thumb 160, medium 640, large 1280, WebP).
  The PRD asks for async generation; there is no worker on the Vercel demo. `media_assets.status` exists
  so a worker job can take over later (Sprint 5 or Next 10) without schema changes.
- **Vercel Blob driver** added alongside local and S3 drivers (`STORAGE_DRIVER`). Vercel caps request
  bodies at 4.5 MB, so `MEDIA_MAX_BYTES=4194304` there; self-hosted default is 10 MB.
- **Primary image = first image** in the admin UI (the API still accepts `primary_media_id`).
- Originals are re-encoded on upload: strips EXIF/GPS and trailing payloads. SVG is not accepted (PRD §10).
- Catalog Manager and Content Designer roles gained `media.delete` (PRD §3 lists media for both).
- Tax class mapping is deferred to the tax module (Next 7); `taxable` is stored now.
- Variable products reject product-level prices (`PRICING_REQUIRES_VARIANTS`); per-variant pricing is Sprint 3.

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

**Exit gate:** PRD §27.4 — a variable product with options can be created, each variant can be
edited, and inventory movements are recorded correctly.

**Status: ☑ all tasks done, exit gate passed (2026-11-19).** Evidence:
`apps/api/src/products/variant-plan.test.ts` (9 reconciliation cases),
`apps/api/test/variants-inventory.e2e.test.ts` (20 cases incl. 20 concurrent adjustments and DB-level
ledger immutability), `apps/admin/e2e/variants-inventory.spec.ts`. Totals: 171 unit/integration + 27 E2E.

Design notes:

- **Reconciliation, not regeneration:** variants are matched by option values (case-insensitive), so
  SKU/price/stock survive edits. Simple → variable keeps the default variant as the first combination;
  new variants copy the first variant's pricing and settings. Removals need `confirm_removals` and are
  previewed first (with stock that would be lost).
- **Uniqueness in the DB:** `option_signature` + partial unique index per product; option names and
  values unique case-insensitively.
- **Stock is a ledger:** `stock_movements` has a CHECK (`after = before + delta`) and a trigger that
  rejects UPDATE/DELETE. Adjustments lock the level row (`SELECT … FOR UPDATE`); a 20-way concurrent
  test proves no lost updates.
- **Permissions:** Catalog Manager reads inventory but can't adjust it (PRD §3 "limited inventory
  permissions"); setting initial stock on create needs `inventory.adjust` too.
- Single default location per store (backfilled by migration, created by seed; future store
  creation must create one — `InventoryService.defaultLocation` also self-heals).
- Reservations (`reserved`) exist in the schema; reserve/release logic arrives with checkout (Next 4).
- Weight and package dimensions (PRD §8.4 E) are not in Sprint 3 scope; planned with shipping.
- Shared `Dialog` now mounts its content only while open (no hidden duplicate forms in the page).

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

**Exit gate:** PRD §27.5 — products can be organized and published; invalid products cannot be
published; drafts and archived products are excluded from public catalog queries.

**Status: ☑ all tasks done, exit gate passed (2026-11-20).** Evidence:
`apps/api/test/organization.e2e.test.ts` (19 cases: category tree rules, collections, organization
filters, redirects, bulk partial failure, duplicate, storefront visibility/field safety, outbox),
`apps/api/src/catalog/category-tree.test.ts`, `apps/admin/e2e/organization.spec.ts`.
Totals: 190 unit/integration + 32 E2E (3 consecutive green runs).

Notes:

- **Categories:** nested up to 3 levels; cycles blocked (API + DB check for self-parent). Deleting a
  category with products requires `reassign_to` or `unassign`; categories with children can't be
  deleted until emptied.
- **Collections:** manual only (automated rules reserved via `collection_type`/`rules_json`).
  Storefront sort options: manual, title, price, newest/oldest.
- **Redirects:** renaming a published product or live collection records a 301 redirect; chains are
  flattened and reverting a rename removes the stale redirect.
- **Outbox:** product/category/collection changes write `outbox_events` in the same transaction.
  Delivery (webhooks, cache purge) is a worker job planned with the developer platform (Next 9).
- **Storefront API** (`/api/v1/storefront/*`, public): active products only; never cost, stock
  counts, SKUs or internal ids beyond product/variant ids; store chosen by `X-Store-Id` until custom
  domains (Next 1). Category filters include subcategories.
- **Bulk actions** process products independently and report per-product failures.
- **Duplicate** copies everything except SKUs/barcodes (must be unique) and stock (starts at 0).
- Bugs found by E2E and fixed: two near-simultaneous image uploads could drop one image
  (stale-ref race); empty SQL join list crashed storefront listing; picker "Add" buttons lacked a
  specific accessible name.

## Sprint 5 — QA, hardening & release ✅

| ID    | Task                                                               | Status | Evidence                                                                                                         |
| ----- | ------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------- |
| S5-01 | Full PRD §29.2 scenario suite (E2E + integration)                  | ✅     | `docs/ACCEPTANCE-PRODUCTS.md` maps all 15 scenarios and 13 criteria to tests                                     |
| S5-02 | Minimal `order_items` snapshot + immutability test                 | ✅     | migration `order_item_snapshots` (DB trigger), `OrderSnapshotService`, `snapshots-activity.e2e`                  |
| S5-03 | Large-catalog performance test (pagination/search on 50k products) | ✅     | `test/perf/catalog.perf.test.ts` (opt-in), `docs/PERFORMANCE.md` — all within budget                             |
| S5-04 | Accessibility (axe) and responsive pass on all product screens     | ✅     | `e2e/a11y.spec.ts`; fixed contrast of subtle text and table overflow at 375px                                    |
| S5-05 | Product activity history view                                      | ✅     | `GET /products/:id/activity`, Activity card on product page                                                      |
| S5-06 | API docs review, operator notes                                    | ✅     | Request bodies in OpenAPI from Zod (`ApiZodBody`), coverage test; `docs/API.md`, `docs/OPERATIONS.md`            |
| S5-07 | Regression run + product-owner acceptance                          | ✅     | Full regression green; accepted by the product owner 2026-11-20; sign-off table in `docs/ACCEPTANCE-PRODUCTS.md` |

**Follow-ups (not blocking release):**

- Inventory search p95 373 ms at 50k (budget 400) — add trigram index on variant title if catalogs grow.
- Generate image derivatives in the worker instead of during upload.
- Deliver outbox events (with webhooks, Next 9).
- Unsaved-changes guard for browser Back; replace the editor's link `prompt()` with a dialog.

## Next 2 — Storefront foundation & default theme

Goal (PRD §27.7): the published catalog renders on a real storefront. Requested by the product owner
right after Products acceptance, ahead of Next 1 (auth hardening).

| ID    | Task                                                                                                                                                                                              | Status | Evidence                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| SF-01 | Public API: store, category tree + detail, collection list, sitemap feed; breadcrumb categories on products                                                                                       | ✅     | `storefront.e2e`                                                                           |
| SF-02 | Draft preview: signed 1-hour links (`POST /products/:id/preview-link`), admin **Preview** button                                                                                                  | ✅     | `preview-token.test`, `storefront.e2e`, admin `preview.spec`, storefront `storefront.spec` |
| SF-03 | Cache invalidation (§8.8 #10): API notifies the storefront after catalog writes; tagged data cache                                                                                                | ✅     | `storefront.e2e` "cache revalidation", storefront "admin edits show up immediately"        |
| SF-04 | `packages/theme-engine`: settings schema (colors, typography, width, buttons, cards, header, footer, spacing), section/template schemas, default theme "Foundry", CSS compiler, AA contrast check | ✅     | `theme.test`                                                                               |
| SF-05 | `apps/storefront`: home (theme sections), all products, collections, collection, category, search, 404                                                                                            | ✅     | `storefront.spec`                                                                          |
| SF-06 | Product page: gallery, option selection with sold-out/unavailable states, price/sale, stock, quantity; add-to-cart shown disabled until Next 4                                                    | ✅     | `storefront.spec` "variant selection", `variants.test`                                     |
| SF-07 | SEO: titles, descriptions, canonical, Open Graph, JSON-LD (Product, BreadcrumbList, WebSite), sitemap.xml, robots.txt, 308 for renamed handles, noindex on search/preview/admin                   | ✅     | `storefront.spec`, `seo.test`                                                              |
| SF-08 | Accessibility + phone layout                                                                                                                                                                      | ✅     | `a11y.spec` (axe on 8 templates), `mobile.spec`                                            |
| SF-09 | Deployment: `cartforge-storefront` project served at the root of the public URL                                                                                                                   | ✅     | `docs/DEPLOY-VERCEL.md` §5                                                                 |
| SF-10 | Demo catalog script (real API, generated illustrations)                                                                                                                                           | ✅     | `apps/api/scripts/demo-catalog.mjs`                                                        |

**Decisions**

- **Separate Next.js app ("zone").** The admin domain forwards everything it doesn't own to the
  storefront; storefront assets live under `/sf-static` so they never collide with the admin's.
- **Theme settings are code-defined in Next 2.** The engine already validates merchant overrides and
  templates; storing, editing, previewing and rolling back theme versions is Next 3.
- **Theme safety (§11.2):** only registered section types; settings are hex colors, enums, bounded
  numbers and plain text; links must be on-site paths. Nothing a merchant enters is executed.
- **Caching:** pages render per request from Next's data cache (tag `catalog`, purged on writes,
  5-minute backstop). The API no longer sends `s-maxage`, so no CDN copy can outlive a purge.
- **Product URLs** are `/products/:handle`; categories `/categories/:handle`; collections
  `/collections/:handle` (handles were already unique per store).

**Follow-ups:** theme editor and versions (Next 3); cart and checkout (Next 4); faceted filters
(price, availability, vendor); per-product cache tags instead of one catalog tag; image CDN resizing.

## Next 4 — Cart and checkout

Goal (PRD §27.7): end-to-end order creation with server-side totals. Requested by the product owner
after Next 2.

| ID    | Task                                                                                                                                                                                                                                              | Status | Evidence                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| CO-01 | `packages/checkout-engine`: deterministic totals (per-line half-up tax, inclusive/exclusive, discount allocation), flat-rate shipping quotes, addresses, settings and custom-field validation                                                     | ✅     | `engine.test` (14)                                         |
| CO-02 | Schema: carts, cart lines, checkouts, inventory reservations, checkout settings, shipping methods, full orders, order events, payments, idempotency keys, per-store order numbers; DB triggers for immutable order money and append-only timeline | ✅     | migration `cart_checkout_orders`                           |
| CO-03 | Guest cart API with re-validation on every read (price changes, sold out, unavailable) (§13.1)                                                                                                                                                    | ✅     | `commerce.e2e` cart block                                  |
| CO-04 | Checkout API: contact, addresses, shipping by destination, payment method, custom fields, terms; totals recomputed each step (§13.2)                                                                                                              | ✅     | `commerce.e2e` checkout block                              |
| CO-05 | Stock reservations with expiry and release (INV-003/004); sale movements on order                                                                                                                                                                 | ✅     | "holds the last unit…", "never sells the same unit twice…" |
| CO-06 | Order completion: idempotency key, one order per checkout, snapshots, payment record, timeline, outbox (§13.3, BE-009)                                                                                                                            | ✅     | "places exactly one order…", replay test                   |
| CO-07 | Payment adapter interface + offline providers (bank transfer, cash on delivery) (§14.1)                                                                                                                                                           | ✅     | `payments.ts`                                              |
| CO-08 | Storefront: add to cart, cart page, 3-step checkout (works without JS), order status page with private key                                                                                                                                        | ✅     | `checkout.spec`                                            |
| CO-09 | Admin: Orders list/detail, Checkout settings (payments, shipping methods, tax, checkout form)                                                                                                                                                     | ✅     | admin `orders.spec`, `a11y.spec`                           |
| CO-10 | Accessibility and phone layout for cart/checkout                                                                                                                                                                                                  | ✅     | storefront `checkout.spec` (axe), `mobile.spec`            |

**Deliberately later**

- Card/wallet payments, webhooks, reconciliation → **Next 5 (Payment Hub)**, behind the same adapter.
- Marking paid, fulfillment, cancel/refund, notifications/emails → **Next 6 (Orders)**.
- Customer accounts, cart merge on login, saved addresses → **Next 7**; carts already have `customer_id`.
- Zones/weights/carrier rates and regional tax rules → **Next 7**; the engine's quote and tax
  functions are the extension points.
- Discount codes → **Next 8**; totals already allocate an order discount across lines.

**Decisions**

- Stock shown to shoppers stays a yes/no, except when a cart asks for more than exists ("Only 3
  available") — the standard trade-off.
- Holds expire lazily (swept before every stock decision and at most once a minute on cart reads),
  so no background worker is needed on serverless hosting.
- Offline payments leave orders `pending` / payment `pending`; stock is committed at order time.
- Order numbers are sequential per store starting at 1001.

## P1 — SaaS platform: separate stores, sign-up and domains

Goal: run CartForge as a hosted service like Shopify, while keeping the self-hosted edition (see
`PLAN.md` §2a). Requested by the product owner after Next 4.

| ID    | Task                                                                                                                                                                      | Status | Evidence                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------- |
| SA-01 | Editions: `CARTFORGE_EDITION`, `SIGNUP_ENABLED`, `PLATFORM_DOMAIN`, `PLATFORM_CNAME_TARGET`, `DOMAIN_PROVIDER`; validated on boot                                         | ✅     | `packages/config` env schema                 |
| SA-02 | Schema: store `handle` (unique, DNS-safe, backfilled), `plan`, suspension fields; `store_domains`; `users.is_platform_admin`                                              | ✅     | migration `platform_saas`                    |
| SA-03 | Store provisioning service (roles, default location, owner, platform address, audit) shared by sign-up, "create store" and seed                                           | ✅     | `platform-saas.e2e`                          |
| SA-04 | Merchant sign-up (`POST /auth/signup`): user + store in one transaction, rate-limited, reserved/taken address checks                                                      | ✅     | `platform-saas.e2e`, admin `saas.spec`       |
| SA-05 | Shopify-style admin: one store at a time, **Your stores** picker, create another store, current-store badge with "View store"                                             | ✅     | admin `saas.spec`, `auth-shell.spec`         |
| SA-06 | Host-based storefront routing: `GET /storefront/resolve`, middleware with cache, 404 for unknown hosts, per-store cache tags (`catalog:<store>`)                          | ✅     | `platform-saas.e2e`, storefront `hosts.spec` |
| SA-07 | Custom domains: add, DNS TXT verification, primary domain, remove; Vercel adapter; TLS-check endpoint for on-demand certificates                                          | ✅     | `platform-saas.e2e`, admin `saas.spec`       |
| SA-08 | Platform admin: all stores with owner, domain and counts; suspend (reason required) and reactivate, audited; staff can't reach it                                         | ✅     | `platform-saas.e2e`, admin `saas.spec`       |
| SA-10 | Store preview without a domain: `?store=<handle>` on the shared address (cookie, preview bar, noindex, fresh cart); admin "Preview store" links and draft previews use it | ✅     | storefront `hosts.spec`, `platform-saas.e2e` |
| SA-11 | Platform admin: move or copy all products between stores (Platform → All stores → Move products); script `apps/api/scripts/move-products.mjs` for the same over the API   | ✅     | `store-transfer.e2e`, admin `transfer.spec`  |
| SA-12 | Passwords: change (signs out other devices), forgot/reset by emailed one-time link (Resend or log), platform admin reset link                                             | ✅     | `account.e2e`, admin `account.spec`          |
| SA-09 | Accessibility of sign-up, Your stores, Domains and platform pages                                                                                                         | ✅     | admin `saas.spec` (axe)                      |

**Deliberately later**

- Billing, plans and limits (stores start on `trial`) → with the Payment Hub (Next 5).
- Staff invitations by email and transferring store ownership → Next 1 (auth hardening).
- Email verification on sign-up → Next 1. (Password change and reset are done: SA-12.)
- Store URL in the admin path (`/admin/store/<handle>/…`) — the admin keeps the current store in
  the browser instead, like Shopify's store switcher.
- Per-store themes from the storefront builder → Next 3.

**Decisions**

- Handles: 3–63 characters, lowercase letters, digits and hyphens; reserved words (`www`, `admin`,
  `api`, `app`, …) refused. Taken names get `-2`, `-3`… suggested.
- A pending domain claim can be replaced by another store (whoever proves DNS first wins); an
  active domain can't.
- Suspended stores disappear from their storefront (404) and from the merchant's picker (shown as
  suspended), but no data is deleted.

## Next 1 — Auth hardening

Goal (PRD §27.7, §23): account security for a hosted platform with many merchants. Password
change/reset shipped earlier (SA-12).

| ID    | Task                                                                                                                                                | Status | Evidence                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------- |
| AU-01 | Team page: members, roles, open invitations; change role, remove access; owner protected; no granting more access than you have                     | ✅     | `staff.e2e`, admin `team.spec`           |
| AU-02 | Invitations by email (7 days, link also shown to the inviter), accept with the invited account or by creating one                                   | ✅     | `staff.e2e`, admin `team.spec`           |
| AU-03 | Email verification: link on sign-up (3 days), banner + resend; invitation and emailed reset also confirm; unconfirmed can't invite when email is on | ✅     | `account.e2e`, admin `account.spec`      |
| AU-04 | Signed-in devices: list, sign out one, sign out everywhere else                                                                                     | ✅     | `account.e2e`, admin `account.spec`      |
| AU-05 | Two-factor sign-in (TOTP): QR setup, recovery codes, two-step login, no code reuse, encrypted secrets, turn off, platform admin reset               | ✅     | `mfa.e2e`, `totp.test`, admin `mfa.spec` |

**Deliberately later**

- Transferring store ownership (needs a deliberate two-sided flow) → with billing.
- Custom roles editor (roles beyond the system ones) → when a merchant asks; the permission
  model already supports them.
- Requiring two-factor for everyone on a store or platform → a setting on top of AU-05.
- Passkeys / WebAuthn → later.

**Decisions**

- Invitations are "possession of the link": anyone holding it can join as the invited email, so
  the inviter is told to share it only with that person. Accepting proves the mailbox.
- When no email service is configured (live demo today), nothing blocks on email: invitation and
  reset links are shown to the person creating them, and the verification banner is hidden.

## Next 6 — Order processing

Goal (PRD §27.7, §15): merchants can take an order from placed to delivered, cancel it or give money
back, and customers are kept informed. Brought ahead of card payments (Next 5) at the product
owner's request, so offline orders don't stay "pending" forever.

| ID    | Task                                                                                                                        | Status | Evidence                                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------- |
| OR-01 | Schema: fulfillments (+items), refunds (+items, append-only), cancellation fields, refunded total ≤ order total (DB checks) | ✅     | migration `order_processing`                          |
| OR-02 | Mark paid; ship all or part with tracking; mark delivered; statuses derived from records; row lock per action               | ✅     | `order-processing.e2e`                                |
| OR-03 | Cancel unshipped orders with restock; paid orders only with a refund; payment voided when unpaid                            | ✅     | `order-processing.e2e`                                |
| OR-04 | Refunds: amount up to what's left, items with optional restock, permission `orders.refund`                                  | ✅     | `order-processing.e2e`                                |
| OR-05 | Staff notes and "who did what" on the timeline                                                                              | ✅     | `order-processing.e2e`, admin `order-processing.spec` |
| OR-06 | Emails: confirmation with status link, new order to store, shipped, canceled, refunded                                      | ✅     | `order-processing.e2e`                                |
| OR-07 | Admin order page actions and dialogs, "To ship" view, permission-aware buttons; a11y                                        | ✅     | admin `order-processing.spec`, `orders.spec`          |
| OR-08 | Customer order page: progress, shipments with tracking, refunds                                                             | ✅     | storefront `checkout.spec`                            |

**Deliberately later**

- Sending refunds through a payment provider, payment webhooks → **Next 5 (Payment Hub)**.
- Editing orders after placement (add/remove items), draft/manual orders created by staff.
- Returns portal for customers, packing slips/invoices (PDF), shipping labels and carrier rates.
- Store notification preferences (which emails the store gets).

**Decisions**

- Shipping before payment is allowed (cash on delivery).
- Refund amounts are suggested from the returned lines (price after discount, plus tax when it was
  added on top) but the merchant decides; shipping can be included.
- A canceled order is never deleted; its money fields stay as placed (DB trigger), refunds are
  separate rows.

## Next 5 — Payment Hub

Goal (PRD §14): online payments behind one adapter boundary, with Pakistani options first (the
product owner's market; Stripe doesn't onboard Pakistani businesses). See `PAYMENTS.md`.

| ID    | Task                                                                                                                                  | Status | Evidence                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------- |
| PH-01 | Provider accounts per store: encrypted, write-only credentials, test/live, audited                                                    | ✅     | `payment-hub.e2e`, admin `payments.spec`              |
| PH-02 | Online flow: pending payment at order time, start/retry with order key, return verification, webhooks, once-only events, amount check | ✅     | `payment-hub.e2e`                                     |
| PH-03 | Stripe: Checkout Session, signed webhooks, session check on return, refunds to card                                                   | ✅     | `payment-hub.e2e`                                     |
| PH-04 | Safepay (beta): tracker, signed redirect                                                                                              | ✅     | `payment-hub.e2e`                                     |
| PH-05 | JazzCash (beta): Page Redirection v1.1, HMAC-SHA256 secure hash, signed return + IPN with signed acknowledgement                      | ✅     | `payment-hub.e2e`, storefront `payments.spec`         |
| PH-06 | Easypaisa (beta): hosted checkout with AES request hash, two-step return, paid only after status inquiry                              | ✅     | `payment-hub.e2e`                                     |
| PH-07 | Wallet / Raast / IBAN transfer method with Pakistani format validation                                                                | ✅     | `payment-hub.e2e`, admin + storefront `payments.spec` |
| PH-08 | Admin Settings → Payments; storefront pay step, Pay now, cookie-free return route                                                     | ✅     | admin + storefront `payments.spec`                    |

**Deliberately later**

- Confirm the beta adapters against each provider's real sandbox (needs merchant credentials).
- PayFast (APPS), Raast QR / Request-to-Pay through a bank, card tokenization, saved cards.
- Refunds through JazzCash/Easypaisa/Safepay APIs (recorded manually for now).
- SaaS plan billing for stores.
- Auto-cancel unpaid online orders after a time limit (they stay pending; the merchant cancels).

**Decisions**

- Money is converted at each adapter's boundary (CartForge keeps ISO/CLDR minor units; PKR has 0
  decimals there; JazzCash counts paisa; Stripe uses its own decimal table).
- Provider returns are cookie-free (store id in the URL) because gateways post back cross-site;
  a second same-site hop uses the browser's order cookie.
- Unsigned provider claims are never trusted: Easypaisa is confirmed by inquiry or by the merchant.

## Next 7 — Customers, shipping and tax

Goal (PRD §16–§18): know who buys, let shoppers keep an account, and charge shipping and tax by
where the order goes (provinces and cities matter for Pakistani couriers and provincial sales tax).

| ID    | Task                                                                                                             | Status | Evidence                                                 |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------- |
| CU-01 | Customers per store, created from orders (existing orders backfilled), stats, search/sort, notes and tags        | ✅     | `customers.e2e`, admin `customers.spec`                  |
| CU-02 | Storefront accounts: sign up, sign in/out, forgot/reset, profile, saved addresses, order history                 | ✅     | `customers.e2e`, storefront `accounts.spec`              |
| CU-03 | Guest-order claim only via emailed link; signed-in orders linked; checkout prefilled from the account            | ✅     | `customers.e2e`, storefront `accounts.spec`              |
| SH-01 | Shipping by province/state and city (names, ISO codes and aliases), province list at checkout for PK/AE/US/CA/AU | ✅     | engine tests, `commerce.e2e`, storefront `accounts.spec` |
| SH-02 | Minimum/maximum order value, per-item charge, delivery estimate shown at checkout                                | ✅     | engine tests, `commerce.e2e`, admin `orders.spec`        |
| TX-01 | Tax rates by country or province overriding the store rate; most specific wins; recorded on the order            | ✅     | engine tests, `commerce.e2e`, admin `orders.spec`        |

**Deliberately later**

- Weight-based rates and live carrier rates (TCS, Leopards, M&P APIs), shipping labels.
- Combined taxes (e.g. federal + provincial on one order), tax-exempt customers, per-product tax classes.
- Cart merge between devices on sign-in; customer segments and marketing email.

**Decisions**

- Customer accounts are per store (like Shopify): the same email can have separate accounts at two
  stores; staff accounts are separate from customer accounts.
- Region matching is by normalised name, ISO 3166-2 code or alias, so free-text addresses from
  other countries still match by name.

## Markets (brought ahead of discounts at the product owner's request)

Goal: sell abroad from one store, Shopify-Markets style, with Pakistani needs first. See
`MARKETS.md`.

| ID    | Task                                                                                                        | Status | Evidence                                         |
| ----- | ----------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------ |
| MK-01 | Markets per store (primary + others), one market per country, admin Settings → Markets                      | ✅     | `markets.e2e`, admin `markets.spec`              |
| MK-02 | Pricing: own rate or live rate (Open Exchange Rates), adjustment, rounding rules, fixed prices              | ✅     | engine `markets.test`, `markets.e2e`, admin spec |
| MK-03 | Products hidden per market; listing, product page, cart                                                     | ✅     | `markets.e2e`, storefront `markets.spec`         |
| MK-04 | Storefront market from choice/location, footer selector, cart re-pricing                                    | ✅     | storefront `markets.spec`                        |
| MK-05 | Checkout: market countries, converted shipping, payment methods per market; orders valued in store currency | ✅     | `markets.e2e`                                    |
| MK-06 | Platform admin: change a store's currency before its first order, keeping shown prices                      | ✅     | `store-currency.e2e`, admin `transfer.spec`      |

## Next 8 — Discounts

Goal (PRD §19): discount codes and automatic discounts, as merchants know them from Shopify. See
`DISCOUNTS.md`.

| ID    | Task                                                                                                    | Status | Evidence                                     |
| ----- | ------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------- |
| DS-01 | Engine: order, products, buy X get Y, free shipping; minimums; best single deal or combinable set       | ✅     | engine `discounts.test`                      |
| DS-02 | Discounts API: codes (unique per store) and automatic; dates, limits, once per customer, markets        | ✅     | `discounts.e2e`                              |
| DS-03 | Checkout: code entry with reasons and hints, per-line allocation, market conversion; orders record them | ✅     | `discounts.e2e`, storefront `discounts.spec` |
| DS-04 | Usage counted at order time with row locks (no overshoot)                                               | ✅     | `discounts.e2e`                              |
| DS-05 | Admin list and Shopify-style editor; order page discount lines                                          | ✅     | admin `discounts.spec`                       |

## Sales — bulk price changes

Goal: take 20% (or an amount) off many products at once by changing their prices, with the old
prices kept and put back on an end date or by hand. See `SALES.md`.

| ID    | Task                                                                                            | Status | Evidence                         |
| ----- | ----------------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| SL-01 | Engine: sale price, three ways to treat already-discounted products, rounding down              | ✅     | engine `sales.test`              |
| SL-02 | Sales API: preview, run now or scheduled, one running sale per variant, saved prices, audit     | ✅     | `sales.e2e`                      |
| SL-03 | Ending: on the end date (as the store is used, plus cron), by hand, per product; edits are kept | ✅     | `sales.e2e`                      |
| SL-04 | Admin: Discounts → Sales tab, run-a-sale form with review, sale page, product page banner       | ✅     | admin `sales.spec`               |
| SL-05 | `discounts.write` permission for discounts and sales (owners and administrators)                | ✅     | migration `20261122220000_sales` |

## Next 3 — Store builder (Round 1)

Goal (PRD §11): merchants design their store like Shopify's theme editor. See `STORE-BUILDER.md`.

| ID    | Task                                                                                                               | Status | Evidence                       |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------ |
| SB-01 | Theme engine v2: sections with blocks, color schemes, fonts (incl. Urdu), header/footer groups, all page types     | ✅     | theme-engine `theme.test`      |
| SB-02 | Presets Foundry, Bazaar, Minimal (valid, WCAG AA)                                                                  | ✅     | theme-engine `theme.test`      |
| SB-03 | Themes API: library (6, one live), draft save (strict), publish, versions, restore, discard, preview tokens        | ✅     | `online-store.e2e`             |
| SB-04 | Storefront renders the live theme or a previewed draft; 17 sections; product information blocks; `/pages/:handle`  | ✅     | storefront e2e (44)            |
| SB-05 | Editor: section/block tree, drag and arrows, click to select, undo/redo, autosave, desktop/phone, publish, history | ✅     | admin `online-store.spec`      |
| SB-06 | Theme settings: typography, layout, buttons, cards, color schemes with contrast warnings, favicon, social links    | ✅     | admin `online-store.spec`      |
| SB-07 | Menus (3 levels, linked by id) and content pages with templates                                                    | ✅     | `online-store.e2e`, admin spec |

## Next 3b — Store builder (Round 2)

| ID    | Task                                                                                                        | Status | Evidence                                     |
| ----- | ----------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------- |
| SB-08 | Brand color builds the color schemes (WCAG AA for any color); image-only banners, banner slider, image grid | ✅     | theme-engine `theme.test`, admin spec        |
| SB-09 | Custom CSS per section and theme-wide: checked (no url/@import/escapes/“<”) and scoped                      | ✅     | `custom-css.test`, `online-store.e2e`        |
| SB-10 | Dynamic values (`{{ product.title }}`…) in text settings, HTML-escaped                                      | ✅     | `theme.test`, admin spec                     |
| SB-11 | Alternate templates for products, collections and pages; Theme template card; `?view=` in previews          | ✅     | `theme.test`, `online-store.e2e`, admin spec |
| SB-12 | Blog: blogs, posts (drafts, scheduling, tags, images), storefront pages, templates, section, menus, sitemap | ✅     | `online-store.e2e`, admin spec               |
