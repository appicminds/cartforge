# CartForge API — Products Management

Base path: **`/api/v1`**. Interactive reference (generated from the code and the Zod contracts):
**`/api/docs`**; machine-readable spec: **`/api/docs/openapi.json`**. Every write endpoint documents
its request body — a test (`platform.e2e`) fails the build if one doesn't.

## Conventions

| Topic      | Rule                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Format     | JSON, `snake_case` fields, ISO-8601 UTC timestamps, UUID ids                                                                     |
| Money      | Integer **minor units** (`price_minor: 1999` = 19.99), currency from the store. Never floats.                                    |
| Lists      | `?page=1&page_size=25` (max 100) → `{ data: [...], meta: { page, page_size, total, total_pages }, request_id }`                  |
| Details    | `{ data: {...}, request_id }`                                                                                                    |
| Errors     | `{ error: { code, message, fields?: [{ path, message, code }] }, request_id }`                                                   |
| Request id | Send `X-Request-Id` to correlate, or one is generated; it's returned in the header and body and logged                           |
| Validation | All input validated server-side with the same Zod schemas the admin uses (`@cartforge/validation`). Unknown fields are rejected. |
| Rich text  | `description_html` is sanitized on the server against an allowlist                                                               |

## Authentication and scope (admin API)

1. `POST /auth/login` `{ email, password }` sets two cookies: `cf_session` (HttpOnly) and `cf_csrf`.
2. Every state-changing request (`POST/PUT/PATCH/DELETE`) must send header **`X-CSRF-Token`** equal
   to the `cf_csrf` cookie, and come from an allowed origin (`ADMIN_ORIGIN`).
3. Store-scoped endpoints require **`X-Store-Id`**; the user needs an active membership in that store.
   A resource from another store responds `404` — never `403` — so ids don't leak across stores.
4. Each endpoint requires a permission (below). Missing → `403 FORBIDDEN`.

Login is rate-limited per IP and per email (`429 RATE_LIMITED`). `GET /auth/me` returns the user,
their stores and permissions; `POST /auth/logout` revokes the session.

## Status codes and error codes

| HTTP      | Typical codes                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400 / 422 | `VALIDATION_FAILED` (with `fields`), `PRODUCT_NOT_PUBLISHABLE` (fields list what's missing), `CATEGORY_DEPTH_EXCEEDED`, `CATEGORY_CYCLE`, `MEDIA_INVALID_FILE`, `INVENTORY_NOT_TRACKED`, `INVENTORY_NO_CHANGE`                                                           |
| 401       | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`                                                                                                                                                                                                                                 |
| 403       | `FORBIDDEN`, `CSRF_INVALID`, `STORE_SCOPE_REQUIRED`, `STORE_ACCESS_DENIED`                                                                                                                                                                                               |
| 404       | `NOT_FOUND`, `MEDIA_NOT_FOUND`, `VARIANT_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `COLLECTION_NOT_FOUND`                                                                                                                                                                        |
| 409       | `PRODUCT_HANDLE_TAKEN`, `SKU_TAKEN`, `CATEGORY_HANDLE_TAKEN`, `COLLECTION_HANDLE_TAKEN`, `HANDLE_CHANGE_REQUIRES_CONFIRMATION`, `VARIANT_REMOVAL_REQUIRES_CONFIRMATION`, `PRODUCT_TYPE_CHANGE_BLOCKED`, `MEDIA_IN_USE`, `CATEGORY_HAS_CHILDREN`, `CATEGORY_HAS_PRODUCTS` |
| 413       | `MEDIA_TOO_LARGE`                                                                                                                                                                                                                                                        |
| 429       | `RATE_LIMITED`                                                                                                                                                                                                                                                           |
| 500       | `INTERNAL_ERROR` (details only in server logs, by request id)                                                                                                                                                                                                            |

Codes are stable: new ones are added, existing ones are never repurposed
(`packages/types/src/api.ts`, `packages/types/src/catalog.ts`).

"Requires confirmation" errors are a two-step flow: repeat the request with the flag the error
names (`confirm_handle_change`, `confirm_removals`).

## Admin endpoints

| Method & path                                                            | Permission                                  | Purpose                                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`, `GET /health/ready`                                       | public                                      | Liveness; readiness checks DB + Redis                                                                                                                                                                        |
| `GET /store`                                                             | any member                                  | Current store (currency, name)                                                                                                                                                                               |
| **Products**                                                             |                                             |                                                                                                                                                                                                              |
| `GET /products`                                                          | products.read                               | List: `q` (title, handle, vendor, SKU, barcode), `status` and `product_type` (comma-separated), `category_id`, `collection_id`, `tag`, `sort` (`title`/`created_at`/`updated_at`/`status`) + `order`, paging |
| `POST /products`                                                         | products.write                              | Create (draft by default) with pricing, SEO, categories, collections, tags, media                                                                                                                            |
| `GET /products/:id`                                                      | products.read                               | Detail incl. options, variants, media, organization                                                                                                                                                          |
| `PATCH /products/:id`                                                    | products.write                              | Partial update; handle change on a live product needs `confirm_handle_change` and records a redirect                                                                                                         |
| `DELETE /products/:id`                                                   | products.delete                             | Soft delete; releases media references                                                                                                                                                                       |
| `POST /products/:id/publish`                                             | products.publish                            | Validates publish rules (price, title, variants priced…) → `active`                                                                                                                                          |
| `POST /products/:id/archive`                                             | products.publish                            | → `archived` (hidden from storefront)                                                                                                                                                                        |
| `POST /products/:id/duplicate`                                           | products.write                              | Draft copy without SKUs or stock                                                                                                                                                                             |
| `POST /products/bulk`                                                    | products.write (+publish/delete per action) | Bulk status, tags, categories, collections, delete; per-item results                                                                                                                                         |
| `POST /products/:id/options/preview`                                     | products.read                               | Dry run: which variants would be created / kept / removed                                                                                                                                                    |
| `PUT /products/:id/options`                                              | products.write                              | Apply options; removing variants needs `confirm_removals`                                                                                                                                                    |
| `PATCH /products/:id/variants`                                           | products.write                              | Bulk-edit variant price, SKU, image…                                                                                                                                                                         |
| `PATCH /variants/:id`                                                    | products.write                              | Edit one variant                                                                                                                                                                                             |
| `POST /products/:id/preview-link`                                        | products.read                               | Signed 1-hour storefront preview link (works for drafts)                                                                                                                                                     |
| `GET /products/:id/activity`                                             | products.read                               | Merged audit + stock history, newest first                                                                                                                                                                   |
| **Categories / collections**                                             |                                             |                                                                                                                                                                                                              |
| `GET /categories`                                                        | products.read                               | Tree (flattened, with depth and path)                                                                                                                                                                        |
| `POST /categories`, `PATCH /categories/:id`                              | categories.write                            | Create / edit (max depth 3, cycle-safe)                                                                                                                                                                      |
| `POST /categories/reorder`                                               | categories.write                            | Siblings order                                                                                                                                                                                               |
| `POST /categories/:id/delete`, `DELETE /categories/:id`                  | categories.write                            | Delete with child/product handling options                                                                                                                                                                   |
| `GET /collections`, `GET /collections/:id`                               | products.read                               | List / detail with ordered members                                                                                                                                                                           |
| `POST /collections`, `PATCH /collections/:id`, `DELETE /collections/:id` | collections.write                           | CRUD                                                                                                                                                                                                         |
| `PUT /collections/:id/products`                                          | collections.write                           | Replace members; order = manual sort order                                                                                                                                                                   |
| **Media**                                                                |                                             |                                                                                                                                                                                                              |
| `POST /media`                                                            | media.write                                 | `multipart/form-data` `file` (+ `alt_text`). JPEG/PNG/WebP/GIF by content sniffing; size cap `MEDIA_MAX_BYTES`; EXIF stripped; thumb/medium/large derivatives                                                |
| `GET /media`, `PATCH /media/:id`                                         | media.read / media.write                    | Library, alt text                                                                                                                                                                                            |
| `DELETE /media/:id`                                                      | media.delete                                | Blocked with `MEDIA_IN_USE` while referenced                                                                                                                                                                 |
| `GET /media/files/*path`                                                 | public                                      | Serves files for the local storage driver only                                                                                                                                                               |
| **Inventory**                                                            |                                             |                                                                                                                                                                                                              |
| `GET /inventory`                                                         | inventory.read                              | Levels per variant: `q`, `stock` filter, paging                                                                                                                                                              |
| `POST /inventory/adjustments`                                            | inventory.adjust                            | `{ variant_id, mode: delta/set, quantity, reason, note }` — transactional; writes an immutable movement                                                                                                      |
| `GET /inventory/movements`                                               | inventory.read                              | Movement ledger for a variant                                                                                                                                                                                |

## Storefront API (public)

No session, no CSRF. Choose the store with `X-Store-Id` (custom domains arrive later).
Responses carry `Cache-Control: public, max-age=0, must-revalidate`: shared caches must not keep
copies, because the storefront app is the cache layer and is purged on every catalog write (see
_Cache invalidation_ below).

| Method & path                          | Purpose                                                                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /storefront/store`                | Store name, currency, locale, contact email                                                                                                                                           |
| `GET /storefront/products`             | Active products only. `q`, `collection` (handle), `category` (handle; includes subcategories), `sort` (`featured`, `newest`, `title_asc`, `price_asc`, `price_desc`), paging (max 50) |
| `GET /storefront/products/:handle`     | Active product. After a rename, the old handle answers `301` with `{ redirect_to }`                                                                                                   |
| `GET /storefront/categories`           | Visible category tree in display order (archived categories hide their subtree), with active-product counts per subtree                                                               |
| `GET /storefront/categories/:handle`   | Category with breadcrumb `ancestors`, `children` and SEO                                                                                                                              |
| `GET /storefront/collections`          | Active collections with active-product counts                                                                                                                                         |
| `GET /storefront/collections/:handle`  | Active collection with SEO fields; redirects like products                                                                                                                            |
| `GET /storefront/sitemap`              | Handles + `updated_at` of everything indexable                                                                                                                                        |
| `GET /storefront/preview/products/:id` | Any non-deleted product, **only** with `?token=` from `POST /products/:id/preview-link`. `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`                                  |

Products include `categories` (visible ones, deepest first — for breadcrumbs) and `updated_at`.
Storefront payloads never contain cost, internal notes, stock counts, SKUs, or audit data —
only `available` booleans, prices, images, options, variants, tags and SEO
(`organization.e2e` asserts it).

### Draft previews

`POST /products/:id/preview-link` (products.read) returns `{ token, expires_at, path, url }`. The token
is an HMAC-signed `{store, product, expiry}` valid for **1 hour**, keyed from `SESSION_SECRET` with a
purpose label — rotating the secret revokes every link. Wrong, expired, tampered or other-store
tokens answer `404`, exactly like a missing product.

### Cache invalidation

After any successful write on products, variants, categories, collections, media or inventory, the API
`POST`s `{ "tags": ["catalog"] }` to `STOREFRONT_REVALIDATE_URL` with header `x-revalidate-secret`
(bounded to 2.5 s; a slow or offline storefront never fails the write). Reads, dry runs and preview
links don't notify. The storefront also revalidates every 5 minutes as a backstop.

## Cart, checkout and orders (Next 4)

### Storefront (public, server-to-server from the storefront)

Carts are addressed by a secret token returned once by `POST /storefront/cart` and sent as
**`X-Cart-Token`** (only its SHA-256 is stored). All responses are `Cache-Control: private, no-store`.
The client never sends prices, discounts, taxes or shipping amounts — only choices.

| Method & path                        | Purpose                                                                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /storefront/cart`              | New cart → `{ token, cart }`. Optional `X-Shopper-IP` for fair rate limits                                                                                            |
| `GET /storefront/cart`               | Cart re-validated against the live catalog; `notices` report price changes, reductions, removals, sold-outs                                                           |
| `POST /storefront/cart/lines`        | `{ variant_id, quantity }` — merges with an existing line; capped at available stock                                                                                  |
| `PATCH /storefront/cart/lines/:id`   | `{ quantity }` (0 removes)                                                                                                                                            |
| `DELETE /storefront/cart/lines/:id`  | Remove a line                                                                                                                                                         |
| `POST /storefront/checkout`          | Start/resume checkout; **holds stock** for the store's reservation window                                                                                             |
| `PATCH /storefront/checkout`         | Any of `email`, `phone`, `shipping_address`, `billing_same_as_shipping`, `billing_address`, `shipping_method_id`, `payment_method`, `custom_fields`, `terms_accepted` |
| `POST /storefront/checkout/complete` | Places the order. **`Idempotency-Key` required**; optional `{ expected_total_minor }` → `409 CHECKOUT_CHANGED` if the server total differs                            |
| `GET /storefront/orders/:id`         | Order status page data; requires **`X-Order-Key`** (secret returned once at completion)                                                                               |

The checkout view lists what is still `missing` (`email`, `shipping_address`, `shipping_method`,
`payment_method`, `custom_fields`, `terms`, `items`, `stock`…) and the server-computed `totals`.

**Integrity rules (PRD §13.3)**

- Totals are recomputed on every step and again inside the order transaction, from catalog rows
  locked `FOR SHARE` — a concurrent price edit can't slip between the total and the line snapshots.
- Idempotency: the first successful response for a key is stored and replayed (header
  `Idempotent-Replayed: true`); a concurrent duplicate gets `409 REQUEST_IN_PROGRESS`; a key reused
  with a different body gets `422`. Independently, a checkout can produce at most one order
  (`orders.checkout_id` is unique; the checkout row is locked during completion).
- Stock: holds are taken under the inventory row lock in a fixed order (no deadlocks), expire after
  `reservation_minutes`, and become a `sale` stock movement referencing the order. Expired holds are
  released before every stock decision.
- Order money fields, items and timeline are immutable at the database level (triggers).

### Admin

| Method & path                                                                           | Permission           | Purpose                                                                     |
| --------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------- |
| `GET /orders`                                                                           | orders.read          | `q` (number, email, product), `status`, `payment_status`, paging            |
| `GET /orders/:id`                                                                       | orders.read          | Items, addresses, totals, custom fields, payments, timeline                 |
| `GET /settings/checkout`                                                                | store.read           | Tax, payment methods, terms, phone, custom fields, reservation time         |
| `PUT /settings/checkout`                                                                | store.settings.write | Replace those settings (validated; bank transfer needs details)             |
| `GET /shipping-methods`                                                                 | store.read           | Flat-rate methods                                                           |
| `POST /shipping-methods`, `PATCH /shipping-methods/:id`, `DELETE /shipping-methods/:id` | store.settings.write | Manage methods (`countries` empty = everywhere; optional `free_over_minor`) |

## Platform: sign-up, stores, domains (P1)

| Method & path                             | Auth / permission         | Purpose                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /platform/config`                    | public                    | `{ edition, signup_enabled, platform_domain }` — what the admin should offer                                                                                                             |
| `POST /auth/signup`                       | public, CSRF origin check | `{ name, email, password, store_name, handle?, currency }` → signed in, returns `/auth/me` shape. `404 SIGNUP_DISABLED` when off; `409 EMAIL_TAKEN` / `HANDLE_TAKEN`; 10 per hour per IP |
| `GET /stores/handle-available?handle=`    | public                    | `{ handle, available, reason }`                                                                                                                                                          |
| `POST /stores`                            | signed in                 | `{ store_name, handle?, currency }` → `{ store_id, name, handle, url }`. `403 STORE_CREATION_DISABLED` unless SaaS sign-up is on or the user is a platform admin                         |
| `GET /domains`                            | store.read                | Platform address and custom domains, each with the DNS records to create                                                                                                                 |
| `POST /domains`                           | store.settings.write      | `{ hostname }` (URLs are cleaned to the host). `409 DOMAIN_TAKEN`, `422 DOMAIN_RESERVED` for platform hosts                                                                              |
| `POST /domains/:id/verify`                | store.settings.write      | Looks up the TXT record; on success attaches the domain and makes it primary if none is. `422 DOMAIN_NOT_VERIFIED` with the reason                                                       |
| `POST /domains/:id/primary`               | store.settings.write      | Only active domains                                                                                                                                                                      |
| `DELETE /domains/:id`                     | store.settings.write      | The platform address can't be removed                                                                                                                                                    |
| `GET /platform/stores`                    | platform admin            | `q`, `status` (`active`/`suspended`), paging; owner, primary domain, product and order counts                                                                                            |
| `PATCH /platform/stores/:id`              | platform admin            | `{ status: "suspended", reason }` or `{ status: "active" }`; audited. Others get `403 PLATFORM_ADMIN_REQUIRED`                                                                           |
| `GET /storefront/resolve?host=`           | public                    | Hostname → `{ store_id, name, url }`; `www.` and ports are ignored; `404` for unknown or suspended stores                                                                                |
| `GET /platform/domains/tls-check?domain=` | public                    | `200` if a certificate may be issued for the host (reverse proxy on-demand TLS), else `404`                                                                                              |

`GET /auth/me` now includes `is_platform_admin`, `can_create_stores`, and for each store
`store_handle`, `store_status` (`active`/`suspended`) and `store_url`.

## Quick example

```bash
curl -s -c jar -H 'Content-Type: application/json' \
  -d '{"email":"owner@example.com","password":"…"}' https://HOST/api/v1/auth/login
```

```bash
curl -s -b jar -H "X-Store-Id: $STORE" -H "X-CSRF-Token: $(awk '/cf_csrf/{print $7}' jar)" \
  -H 'Content-Type: application/json' -H 'Origin: https://HOST' \
  -d '{"title":"Linen shirt","price_minor":4900}' https://HOST/api/v1/products
```
