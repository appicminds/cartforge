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
Responses carry `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`.

| Method & path                         | Purpose                                                                                                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /storefront/products`            | Active products only. `q`, `collection` (handle), `category` (handle; includes subcategories), `sort` (`featured`, `newest`, `oldest`, `title_asc`, `title_desc`, `price_asc`, `price_desc`), paging |
| `GET /storefront/products/:handle`    | Active product. After a rename, the old handle answers `301` with `{ redirect_to }`                                                                                                                  |
| `GET /storefront/collections/:handle` | Active collection with SEO fields; redirects like products                                                                                                                                           |

Storefront payloads never contain cost, internal notes, stock counts, SKUs of drafts, or audit data —
only `available` booleans, prices, images, options, variants, tags and SEO
(`organization.e2e` asserts the exact key set).

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
