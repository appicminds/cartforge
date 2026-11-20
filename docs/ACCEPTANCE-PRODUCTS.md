# Products Management — Acceptance Package

**Milestone:** PRD §8 "Product Management — first delivery milestone" (Sprints 0–5).
**Status:** ready for product-owner acceptance (2026-11-20).
**Evidence:** automated tests listed below, all green; full regression 2026-11-20: format, lint, typecheck, build, 202 unit/integration tests, 42 browser tests × 3 consecutive runs — all green.

Test locations: API integration tests in `apps/api/test/*.e2e.test.ts` (real PostgreSQL + Redis);
browser tests in `apps/admin/e2e/*.spec.ts` (Playwright, real API); unit tests next to their source.

## 1. PRD §8.11 acceptance criteria

| #   | Criterion                                                                     | Evidence                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Catalog manager creates a simple draft product and retrieves it after refresh | `products.e2e` "creates a simple draft…"; `products.spec` "create a draft, find it, open it, edit it…"                                                                                                                                                |
| 2   | Upload multiple images, reorder, select primary                               | `media.e2e` "creates a priced product with ordered images…", "reorders images, changes primary…"; `media-pricing.spec` "upload images, choose primary…"                                                                                               |
| 3   | Variable product with option values and valid combinations                    | `variant-plan.test`; `variants-inventory.e2e` "converts simple → variable…", "adding an option keeps existing variants…"; `variants-inventory.spec` "options → preview → apply…"                                                                      |
| 4   | Each variant has its own SKU, price, image and stock                          | `variants-inventory.e2e` "edits a variant: SKU, price, threshold, image validation", "adds, removes and sets stock…"                                                                                                                                  |
| 5   | Duplicate SKU and duplicate handle return clear validation errors             | `products.e2e` "rejects an explicit duplicate handle…"; `variants-inventory.e2e` "enforces SKU uniqueness…"; `products.spec` "shows field errors for a duplicate handle…"                                                                             |
| 6   | Publishing blocked when required information is missing                       | `products.e2e` "publishes, then requires confirmation…" (422 without price); `variants-inventory.e2e` "blocks publishing while any variant has no price"; `media-pricing.spec` "publishing requires a price"; `organization.spec` bulk failure report |
| 7   | Active products appear in the storefront catalog; drafts and archived do not  | `organization.e2e` "lists only active products and never internal fields", "hides drafts by handle…" (public storefront API)                                                                                                                          |
| 8   | Search, filters, sorting, pagination, bulk actions on real data               | `products.e2e` list block; `organization.e2e` filters + bulk; `products.spec`, `organization.spec`; 50k-product run in `PERFORMANCE.md`                                                                                                               |
| 9   | Inventory adjustment creates a movement and updates the level transactionally | `variants-inventory.e2e` "adds, removes and sets stock…", "serializes concurrent adjustments…", "keeps the movement ledger immutable…"                                                                                                                |
| 10  | Unauthorized users can't access or mutate products via direct API calls       | `products.e2e` authorization block; `store-scope.e2e`; `organization.e2e` "checks per-action permissions"                                                                                                                                             |
| 11  | Product edits don't alter historical order item snapshots                     | `snapshots-activity.e2e` "copy catalog data at purchase time and never change afterwards", "rejects any change to a snapshot at the database level"                                                                                                   |
| 12  | All product screens have loading, empty, error and success states             | `products.spec` empty/no-results/not-found/read-only; error states covered by component code reviews; `a11y.spec` scans each screen loaded                                                                                                            |
| 13  | Automated tests cover core product rules and API authorization                | This document: 202 unit/integration + 42 browser tests                                                                                                                                                                                                |

## 2. PRD §29.2 Product Management test scenarios

| #   | Scenario                                                       | Evidence                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Simple draft with minimum fields                               | `products.e2e` "creates a simple draft…"                                                                                                                                                                         |
| 2   | Description, multiple images, pricing, SKU and SEO             | `media.e2e` priced product with images; `organization.e2e` "assigns categories, collections, normalized tags and SEO"; `products.e2e` "sanitizes the description"                                                |
| 3   | Variable product, two option dimensions, multiple combinations | `variants-inventory.e2e` "adding an option keeps existing variants…" (Size × Color = 4)                                                                                                                          |
| 4   | Duplicate SKU and duplicate handle                             | see §1 #5                                                                                                                                                                                                        |
| 5   | Invalid price and compare-at values                            | `media.e2e` "validates prices against stored values"; `money.test`; `media-pricing.spec` "validates prices client- and server-side"                                                                              |
| 6   | Publish valid product, verify storefront visibility            | `organization.e2e` storefront block; `snapshots-activity.e2e` (active product sellable)                                                                                                                          |
| 7   | Publish invalid product, actionable errors                     | see §1 #6                                                                                                                                                                                                        |
| 8   | Archive product, verify storefront exclusion                   | `organization.e2e` storefront fixture archives a product and asserts it's excluded                                                                                                                               |
| 9   | Duplicate product, controlled copy                             | `organization.e2e` "copies a variable product as a draft without SKUs or stock"; `organization.spec` "duplicate a product from its page"                                                                         |
| 10  | Adjust inventory, verify movement history                      | `variants-inventory.e2e` ledger tests; `variants-inventory.spec` (history dialog + Activity card)                                                                                                                |
| 11  | Unauthorized access and mutation                               | see §1 #10                                                                                                                                                                                                       |
| 12  | Cross-store access using a different store context             | `products.e2e` "returns 404 for a product id from another store…"; `variants-inventory.e2e` "is isolated per store"; `media.e2e` "refuses images from another store"; `snapshots-activity.e2e` "is store-scoped" |
| 13  | Delete or detach referenced media, safe behaviour              | `media.e2e` "blocks deleting referenced media…", "releases references when a product is deleted"                                                                                                                 |
| 14  | Search, filter, sort, paginate, bulk update                    | see §1 #8                                                                                                                                                                                                        |
| 15  | Historical order snapshots unchanged by later edits            | see §1 #11                                                                                                                                                                                                       |

## 3. Cross-cutting requirements verified

| Requirement                                                                | Evidence                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Store isolation on every query (BE-012)                                    | `store-scope.e2e`, cross-store tests above; `storeScoped()` unit test      |
| Server-side validation, consistent errors with request id (BE-002, BE-007) | `platform.e2e`, `auth.e2e`, field-error assertions throughout              |
| Money as integer minor units (BE-005)                                      | `money.test`; DB CHECK constraints; float prices rejected in `media.e2e`   |
| Audit of sensitive changes (BE-006)                                        | `products.e2e` audit tests; `media.e2e` price audit; activity endpoint     |
| Transactions + concurrency safety (BE-004, §9.3)                           | 20-way concurrent adjustment test                                          |
| Outbox for events (BE-010)                                                 | `organization.e2e` "writes outbox events in the same transaction"          |
| OpenAPI generated from contracts (BE-001, §21)                             | `platform.e2e` "documents a request body for every write endpoint…"        |
| XSS: sanitized rich text (§23)                                             | `sanitize-html.test`, `products.e2e`                                       |
| CSRF, sessions, rate limiting (§23)                                        | `auth.e2e`                                                                 |
| Upload safety (§8.4 B, §10)                                                | `image-processor.test`, `media.e2e` (type sniffing, size, traversal, EXIF) |
| Accessibility WCAG 2.1 AA (FE-007, §30)                                    | `a11y.spec` (axe) on every admin screen and key dialogs                    |
| Responsive (FE-010)                                                        | `a11y.spec` phone-width overflow checks; `responsive.spec`                 |
| Performance at 50k products (§29.1)                                        | `PERFORMANCE.md`                                                           |

## 4. Release severity status (PRD §29.3)

- **Critical:** none open.
- **High:** none open.
- **Medium (accepted, scheduled):**
  - Unsaved-changes guard does not intercept the browser Back button (App Router limitation).
  - Image derivatives are generated during the upload request, not asynchronously (no worker on the Vercel demo); `media_assets.status` supports moving this to a worker.
  - Outbox events are written but not yet delivered (delivery worker arrives with webhooks, Next 9).
- **Low:** link insertion in the description editor uses a browser prompt; inventory search p95 is 373 ms at 50k variants (budget 400 ms).

## 5. Sign-off

| Role          | Name | Decision                                         | Date |
| ------------- | ---- | ------------------------------------------------ | ---- |
| Product owner |      | ☐ Accepted ☐ Accepted with conditions ☐ Rejected |      |

Notes / conditions:
