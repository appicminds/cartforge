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

| Method & path                                                            | Permission                                  | Purpose                                                                                                                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`, `GET /health/ready`                                       | public                                      | Liveness; readiness checks DB + Redis                                                                                                                                                                                 |
| `GET /store`                                                             | any member                                  | Current store (currency, name)                                                                                                                                                                                        |
| **Products**                                                             |                                             |                                                                                                                                                                                                                       |
| `GET /products`                                                          | products.read                               | List: `q` (title, handle, vendor, SKU, barcode), `status` and `product_type` (comma-separated), `category_id`, `collection_id`, `tag`, `sort` (`title`/`created_at`/`updated_at`/`status`) + `order`, paging          |
| `POST /products`                                                         | products.write                              | Create (draft by default) with pricing, SEO, categories, collections, tags, media                                                                                                                                     |
| `GET /products/:id`                                                      | products.read                               | Detail incl. options, variants, media, organization                                                                                                                                                                   |
| `PATCH /products/:id`                                                    | products.write                              | Partial update; handle change on a live product needs `confirm_handle_change` and records a redirect                                                                                                                  |
| `DELETE /products/:id`                                                   | products.delete                             | Soft delete; releases media references                                                                                                                                                                                |
| `POST /products/:id/publish`                                             | products.publish                            | Validates publish rules (price, title, variants priced…) → `active`                                                                                                                                                   |
| `POST /products/:id/archive`                                             | products.publish                            | → `archived` (hidden from storefront)                                                                                                                                                                                 |
| `POST /products/:id/duplicate`                                           | products.write                              | Draft copy without SKUs or stock                                                                                                                                                                                      |
| `POST /products/bulk`                                                    | products.write (+publish/delete per action) | Bulk status, tags, categories, collections, delete; per-item results                                                                                                                                                  |
| `POST /products/:id/options/preview`                                     | products.read                               | Dry run: which variants would be created / kept / removed                                                                                                                                                             |
| `PUT /products/:id/options`                                              | products.write                              | Apply options; removing variants needs `confirm_removals`                                                                                                                                                             |
| `PATCH /products/:id/variants`                                           | products.write                              | Bulk-edit variant price, SKU, image…                                                                                                                                                                                  |
| `PATCH /variants/:id`                                                    | products.write                              | Edit one variant                                                                                                                                                                                                      |
| `POST /products/:id/preview-link`                                        | products.read                               | Signed 1-hour storefront preview link (works for drafts)                                                                                                                                                              |
| `GET /products/:id/activity`                                             | products.read                               | Merged audit + stock history, newest first                                                                                                                                                                            |
| **Categories / collections**                                             |                                             |                                                                                                                                                                                                                       |
| `GET /categories`                                                        | products.read                               | Tree (flattened, with depth and path)                                                                                                                                                                                 |
| `POST /categories`, `PATCH /categories/:id`                              | categories.write                            | Create / edit (max depth 3, cycle-safe)                                                                                                                                                                               |
| `POST /categories/reorder`                                               | categories.write                            | Siblings order                                                                                                                                                                                                        |
| `POST /categories/:id/delete`, `DELETE /categories/:id`                  | categories.write                            | Delete with child/product handling options                                                                                                                                                                            |
| `GET /collections`, `GET /collections/:id`                               | products.read                               | List / detail with ordered members                                                                                                                                                                                    |
| `POST /collections`, `PATCH /collections/:id`, `DELETE /collections/:id` | collections.write                           | CRUD                                                                                                                                                                                                                  |
| `PUT /collections/:id/products`                                          | collections.write                           | Replace members; order = manual sort order                                                                                                                                                                            |
| **Media**                                                                |                                             |                                                                                                                                                                                                                       |
| `POST /media`                                                            | media.write                                 | `multipart/form-data` `file` (+ `alt_text`). JPEG/PNG/WebP/GIF by content sniffing; size cap `MEDIA_MAX_BYTES`; EXIF stripped; thumb/medium/large derivatives                                                         |
| `POST /media/videos/uploads`                                             | media.write                                 | JSON `filename`, `mime_type` (mp4/webm/quicktime), `size_bytes`, `checksum_sha256`. Returns the existing asset (same file) or `upload`: `vercel-blob` (browser uploads straight to Blob with `client_token`) or `api` |
| `POST /media/videos`                                                     | media.write                                 | Multipart `poster` (cover frame, made in the browser) + optional `file` (the video, `api` strategy) + fields. Container sniffed; cap `MEDIA_MAX_VIDEO_BYTES`. `url` is the cover; `video_url` the file                |
| `GET /media`, `PATCH /media/:id`                                         | media.read / media.write                    | Library, alt text                                                                                                                                                                                                     |
| `DELETE /media/:id`                                                      | media.delete                                | Blocked with `MEDIA_IN_USE` while referenced                                                                                                                                                                          |
| `GET /media/files/*path`                                                 | public                                      | Serves files for the local storage driver only                                                                                                                                                                        |
| **Inventory**                                                            |                                             |                                                                                                                                                                                                                       |
| `GET /inventory`                                                         | inventory.read                              | Levels per variant: `q`, `stock` filter, paging                                                                                                                                                                       |
| `POST /inventory/adjustments`                                            | inventory.adjust                            | `{ variant_id, mode: delta/set, quantity, reason, note }` — transactional; writes an immutable movement                                                                                                               |
| `GET /inventory/movements`                                               | inventory.read                              | Movement ledger for a variant                                                                                                                                                                                         |

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

## Account security (Next 1)

| Method & path                         | Auth           | Purpose                                                                                                                                              |
| ------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/login`                    | public         | With two-factor on, answers `{ mfa_required: true, mfa_token }` (5 minutes) and sets no cookies                                                      |
| `POST /auth/login/mfa`                | public         | `{ mfa_token, code }` — 6-digit app code or a recovery code (`abcd-efgh`) → signed in. Wrong → `422 INVALID_MFA_CODE`; 10 tries / 15 min per account |
| `GET /auth/mfa`                       | signed in      | `{ enabled, recovery_codes_left }`                                                                                                                   |
| `POST /auth/mfa/setup`                | signed in      | `{ secret, otpauth_url }` (secret stored encrypted until confirmed)                                                                                  |
| `POST /auth/mfa/enable`               | signed in      | `{ code }` → `{ recovery_codes }` (10, shown once)                                                                                                   |
| `POST /auth/mfa/disable`              | signed in      | `{ password, code }`                                                                                                                                 |
| `POST /auth/mfa/recovery-codes`       | signed in      | `{ code }` → new `recovery_codes`; the old ones stop working                                                                                         |
| `POST /platform/users/mfa-reset`      | platform admin | `{ email }` — turn off someone's two-factor sign-in (audited)                                                                                        |
| `GET /auth/sessions`                  | signed in      | Your devices: `device` ("Chrome on macOS"), `ip`, `last_seen_at`, `current`                                                                          |
| `DELETE /auth/sessions/:id`           | signed in      | Sign out one of your other devices                                                                                                                   |
| `POST /auth/sessions/sign-out-others` | signed in      | Sign out everywhere but here → `{ signed_out }`                                                                                                      |
| `POST /auth/email/verify`             | public         | `{ token }` from the confirmation email (3 days). Used/expired → `400`                                                                               |
| `POST /auth/email/resend`             | signed in      | Send the confirmation link again (3 per hour) → `{ emailed }`                                                                                        |

`GET /auth/me` adds `email_verified` and `mfa_enabled`; `GET /platform/config` adds `email`
(`sent` · `logged` · `off`).

### Team and invitations

| Method & path                   | Auth / permission | Purpose                                                                                                                                                                               |
| ------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /staff`                    | staff.read        | `{ members, invitations, roles }`; each role says whether you may give it (`assignable`)                                                                                              |
| `POST /staff/invitations`       | staff.write       | `{ email, role_id }` → invitation with its `url` (7 days) and whether it was `emailed`. `409 ALREADY_MEMBER`; `422 ROLE_NOT_ALLOWED`; `403 EMAIL_NOT_VERIFIED` (when emails are sent) |
| `DELETE /staff/invitations/:id` | staff.write       | Cancel                                                                                                                                                                                |
| `PATCH /staff/members/:id`      | staff.write       | `{ role_id }` → team. Never the owner (`403 OWNER_PROTECTED`) or yourself                                                                                                             |
| `DELETE /staff/members/:id`     | staff.write       | Remove access (same rules)                                                                                                                                                            |
| `POST /invitations/preview`     | public            | `{ token }` → store, email, role, inviter, `account_exists`                                                                                                                           |
| `POST /invitations/accept`      | signed in         | `{ token }` — the invitation's email must be yours (`403 INVITATION_EMAIL_MISMATCH`)                                                                                                  |
| `POST /invitations/accept-new`  | public            | `{ token, name, password }` → account + membership, signed in. `409 ACCOUNT_EXISTS` → sign in instead                                                                                 |

Rule: you can give (or change, or remove) a role only if you hold every permission in it, and
nobody can grant "owner". Tokens travel in request bodies, never URLs of API calls.

## Passwords

| Method & path                     | Auth           | Purpose                                                                                                        |
| --------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /auth/password`             | signed in      | `{ current_password, new_password }` → `204`; other sessions end. Wrong current → `422` on `current_password`  |
| `POST /auth/password/forgot`      | public         | `{ email }` → always `202`. Emails a one-time link (1 hour) if the account exists; max 3 per hour per account  |
| `POST /auth/password/reset`       | public         | `{ token, new_password }` → `204`; link used up, all sessions end. Bad/expired/used → `400 RESET_LINK_INVALID` |
| `POST /platform/users/reset-link` | platform admin | `{ email }` → `{ email, url, expires_at }` to hand over (not emailed); audited. Not for platform admins        |

New passwords: at least 12 characters, mixing letters with numbers or symbols.

## Platform: sign-up, stores, domains (P1)

| Method & path                                 | Auth / permission         | Purpose                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /platform/config`                        | public                    | `{ edition, signup_enabled, platform_domain }` — what the admin should offer                                                                                                                                                                                                              |
| `POST /auth/signup`                           | public, CSRF origin check | `{ name, email, password, store_name, handle?, currency }` → signed in, returns `/auth/me` shape. `404 SIGNUP_DISABLED` when off; `409 EMAIL_TAKEN` / `HANDLE_TAKEN`; 10 per hour per IP                                                                                                  |
| `GET /stores/handle-available?handle=`        | public                    | `{ handle, available, reason }`                                                                                                                                                                                                                                                           |
| `POST /stores`                                | signed in                 | `{ store_name, handle?, currency }` → `{ store_id, name, handle, url }`. `403 STORE_CREATION_DISABLED` unless SaaS sign-up is on or the user is a platform admin                                                                                                                          |
| `GET /domains`                                | store.read                | Platform address and custom domains, each with the DNS records to create                                                                                                                                                                                                                  |
| `POST /domains`                               | store.settings.write      | `{ hostname }` (URLs are cleaned to the host). `409 DOMAIN_TAKEN`, `422 DOMAIN_RESERVED` for platform hosts                                                                                                                                                                               |
| `POST /domains/:id/verify`                    | store.settings.write      | Looks up the TXT record; on success attaches the domain and makes it primary if none is. `422 DOMAIN_NOT_VERIFIED` with the reason                                                                                                                                                        |
| `POST /domains/:id/primary`                   | store.settings.write      | Only active domains                                                                                                                                                                                                                                                                       |
| `DELETE /domains/:id`                         | store.settings.write      | The platform address can't be removed                                                                                                                                                                                                                                                     |
| `GET /platform/stores`                        | platform admin            | `q`, `status` (`active`/`suspended`), paging; owner, primary domain, product and order counts                                                                                                                                                                                             |
| `PATCH /platform/stores/:id`                  | platform admin            | `{ status: "suspended", reason }` or `{ status: "active" }`; audited. Others get `403 PLATFORM_ADMIN_REQUIRED`                                                                                                                                                                            |
| `POST /platform/stores/:id/transfer-products` | platform admin            | `{ to_store_id, mode: "move" \| "copy", price_rate? }` — copies draft/active products (images, variants, stock, categories, collections) into another store; `move` archives the originals. Batches of 4: repeat until `remaining` is 0. `422 PRICE_RATE_REQUIRED` when currencies differ |
| `GET /storefront/resolve?host=` or `?handle=` | public                    | Hostname (or, for previews, a store handle) → `{ store_id, name, url }`; `www.` and ports are ignored; `404` for unknown or suspended stores                                                                                                                                              |
| `GET /platform/domains/tls-check?domain=`     | public                    | `200` if a certificate may be issued for the host (reverse proxy on-demand TLS), else `404`                                                                                                                                                                                               |

`GET /auth/me` now includes `is_platform_admin`, `can_create_stores`, and for each store
`store_handle`, `store_status` (`active`/`suspended`), `store_url` (its own domain) and
`store_preview_url` (`<STOREFRONT_URL>/?store=<handle>`). Draft preview links use the store's
own domain when it has one, otherwise the preview address.

## Order processing (Next 6)

Every action locks the order, writes the timeline (with the staff member) and answers with the
updated order. Statuses are re-derived from the records each time:

- **payment** `pending` → `paid` → `partially_refunded` / `refunded`; unpaid canceled orders → `voided`
- **fulfillment** `unfulfilled` → `partially_fulfilled` → `fulfilled` (refunded units don't need shipping)
- **order** `pending` (nothing done) · `processing` · `completed` (paid and shipped) · `canceled` · `refunded`

| Method & path                                            | Permission    | Purpose                                                                                                                                                                                                              |
| -------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /orders?to_ship=true`                               | orders.read   | Orders with items still to ship (not canceled)                                                                                                                                                                       |
| `POST /orders/:id/mark-paid`                             | orders.write  | `{ reference? }` — offline payment arrived. `409` if already recorded or canceled                                                                                                                                    |
| `POST /orders/:id/fulfillments`                          | orders.write  | `{ items?: [{ order_item_id, quantity }], tracking_company?, tracking_number?, tracking_url?, notify_customer = true }`; omitted `items` = everything left. `422 QUANTITY_TOO_HIGH`                                  |
| `POST /orders/:id/fulfillments/:fulfillmentId/delivered` | orders.write  | Mark a shipment delivered                                                                                                                                                                                            |
| `POST /orders/:id/cancel`                                | orders.write  | `{ reason: customer·inventory·fraud·declined·other, restock = true, refund = false, notify_customer = true }`. Only unshipped orders; paid ones need `refund: true` (and orders.refund) → `409 ORDER_PAID` otherwise |
| `POST /orders/:id/refunds`                               | orders.refund | `{ amount_minor, items?: [{ order_item_id, quantity, restock }], reason?, notify_customer = true }`; paid orders only; never more than what's left (`422 REFUND_TOO_HIGH`)                                           |
| `POST /orders/:id/notes`                                 | orders.write  | `{ message }` — staff note on the timeline                                                                                                                                                                           |

Order detail adds `fulfillments`, `refunds`, `line_progress` (shipped/refunded per line),
`canceled_at`, `cancel_reason`, `refunded_minor`; timeline events carry `actor`. The customer's
order page (`GET /storefront/orders/:id`) gets `fulfillments` (with tracking), `canceled_at` and
`refunded_minor`.

Refunds are recorded, not sent: until the Payment Hub (Next 5), the merchant returns the money the
way it was received. `refunds` rows are append-only and the database refuses a refunded total above
the order total.

**Emails** (through the email provider; each attempt is noted on the timeline): order confirmation
with the private status link, new-order notice to the store's contact email, shipped (with
tracking), canceled, refunded. Replies go to the store's contact email.

## Payment Hub (Next 5)

See `PAYMENTS.md` for the merchant view.

| Method & path                                | Auth / permission  | Purpose                                                                                                                                                                                                        |
| -------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /payments/providers`                    | store.read         | Provider catalogue and this store's connections (`values` = non-secret fields, `set_fields`, `webhook_url`, `return_url`)                                                                                      |
| `PUT /payments/accounts/:provider`           | payments.secrets   | `{ mode: test·live, enabled, credentials: {…} }` — empty/omitted secrets keep the saved ones; Stripe keys must match the mode                                                                                  |
| `DELETE /payments/accounts/:provider`        | payments.secrets   | Disconnect and delete credentials                                                                                                                                                                              |
| `POST /storefront/orders/:id/payment`        | `X-Order-Key`      | Start or retry paying → `{ method: GET·POST, url, fields }`. Optional `X-Shopper-Origin` (used for the return trip if it's one of the store's addresses). `409` if paid/canceled, `502 PAYMENT_PROVIDER_ERROR` |
| `POST /storefront/payments/:provider/return` | public             | `{ params }` the provider sent back → verified → `{ order_id, outcome, redirect }` (`redirect` for multi-step providers). `400 PAYMENT_SIGNATURE_INVALID`                                                      |
| `POST /payments/webhooks/:provider/:storeId` | provider signature | Webhook / IPN. Raw body verified (Stripe-Signature with 5-minute window; JazzCash secure hash with signed acknowledgement)                                                                                     |

Checkout: connected providers that accept the store's currency appear in `payment_options`;
`POST /storefront/checkout/complete` returns `pay_online: true` for them. Customer order view adds
`payment.online`, `payment.can_pay` and `payment.failure_reason`. `POST /orders/:id/refunds` accepts
`through_provider` (default: automatic when the provider supports refunds). Provider messages are
recorded once per store in `payment_events`; amounts must match before an order is marked paid.

Offline method `wallet_transfer` (Checkout settings `wallet_*`): JazzCash/Easypaisa/Raast numbers
(`03XXXXXXXXX`) and Pakistani IBAN, shown to customers with the order number as reference.

## Customers, shipping and tax (Next 7)

| Method & path                                                                          | Auth / permission | Purpose                                                                                                                |
| -------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET /customers`                                                                       | customers.read    | List with order count, amount spent (paid − refunded, canceled excluded), last order; search and sort                  |
| `GET /customers/:id`                                                                   | customers.read    | Profile, saved addresses, orders                                                                                       |
| `PATCH /customers/:id`                                                                 | customers.write   | Names, phone, marketing consent, note, tags                                                                            |
| `POST /storefront/account/register`                                                    | public            | `{ email, password, first_name?, last_name?, accepts_marketing? }` → `{ token }`, or `{ link_sent: true }` (see below) |
| `POST /storefront/account/login`                                                       | public            | `{ email, password }` → `{ token }`; `401 CUSTOMER_INVALID_LOGIN` (same answer for unknown emails); rate-limited       |
| `POST /storefront/account/logout`                                                      | customer token    | Ends that sign-in                                                                                                      |
| `POST /storefront/account/password/forgot`                                             | public            | Always `204`; emails a 1-hour link to existing customers (max 3 an hour)                                               |
| `POST /storefront/account/password/reset`                                              | public            | `{ token, password }` → `{ token }`; ends other sign-ins                                                               |
| `GET·PATCH /storefront/account`                                                        | customer token    | Profile and saved addresses                                                                                            |
| `POST /storefront/account/addresses`, `PATCH·DELETE /storefront/account/addresses/:id` | customer token    | Up to 10 addresses; one default                                                                                        |
| `GET /storefront/account/orders`, `GET /storefront/account/orders/:id`                 | customer token    | The customer's own orders (same view as the private order link)                                                        |

Storefront account calls send the store (`X-Store-Id`) and `X-Customer-Token`; sign-ins last 30
days and belong to one store. Registering with an email that already has guest orders doesn't
create a session: a link is emailed instead, so order history is only shown to the mailbox owner.
`POST /storefront/checkout/complete` with `X-Customer-Token` links the order to that customer;
guest orders are linked by email (customers are created on first order).

**Shipping methods** (`POST /shipping-methods`, `PATCH /shipping-methods/:id`) add `regions`
(province/state names or codes; needs exactly one country), `cities`, `min_order_minor`,
`max_order_minor`, `per_item_minor` (each item after the first), `min_days`, `max_days`. A PATCH
merges only the fields sent and validates the result. Checkout `shipping_options[]` add
`estimate: { min_days, max_days } | null`.

**Tax rules**: Checkout settings `tax_rules: [{ country, region, rate_bps, label }]` (max 100; one
rule per place). The order's destination — shipping address, or billing address when nothing
ships — uses the province rule, then the country rule (`region: ""`), then `tax_rate_bps`.
Checkout `totals.tax_rate_bps`/`tax_label` and the order record show what applied.

**Changing a store's currency** (platform admin): `POST /platform/stores/:id/currency`
`{ currency }` keeps the prices people see (4,799.00 USD → Rs 4,799; amounts are re-stored for the
new currency's decimals, fractions that don't fit are rounded) and empties open carts. Only before
the store's first order (`409 STORE_HAS_ORDERS`). Admin: Platform → Stores → **Currency**.

## Markets

See `MARKETS.md`.

| Method & path                       | Auth / permission    | Purpose                                                                                                                    |
| ----------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GET /markets`                      | store.read           | `{ store_currency, live_rates_available, markets[] }` (creates the primary market on first use)                            |
| `POST /markets`, `PUT /markets/:id` | store.settings.write | `{ name, currency, countries, active, pricing_mode: manual·live, manual_rate, adjustment_bps, rounding, payment_methods }` |
| `DELETE /markets/:id`               | store.settings.write | Not the primary market (`409 PRIMARY_MARKET_LOCKED`)                                                                       |
| `GET·PUT /products/:id/markets`     | products.read/write  | `{ hidden_market_ids, prices: [{ market_id, variant_id, price_minor \| null, compare_at_minor }] }`                        |
| `GET /storefront/markets`           | public               | Active markets for the selector (`id: "primary"` before any market exists)                                                 |
| `PUT /storefront/cart/market`       | cart token           | `{ market_id }` — re-price the cart in another market                                                                      |

Catalog reads take `?market=<id>` (products, product, preview); product responses carry the
market `currency` and `market_available`. `POST /storefront/cart` takes `X-Market`. Validation:
one market per country (`MARKET_COUNTRY_TAKEN`), PKR-only payment methods only in PKR markets, a
rate for manual markets, live mode only when `FX_PROVIDER` is configured.

## Discounts (Next 8)

See `DISCOUNTS.md`.

| Method & path                           | Auth / permission | Purpose                                                                                                                                                                                                                            |
| --------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /discounts`                        | store.read        | List with `status`, `used_count`, `summary` (`q`: title or code, `status`)                                                                                                                                                         |
| `GET /discounts/:id`                    | store.read        | One discount                                                                                                                                                                                                                       |
| `POST /discounts`, `PUT /discounts/:id` | discounts.write   | `{ title, method: code·automatic, code, kind: order·products·bxgy·shipping, value_type, value, target, buy, min_subtotal_minor, min_quantity, starts_at, ends_at, usage_limit, once_per_customer, combines, market_ids, enabled }` |
| `DELETE /discounts/:id`                 | discounts.write   | Delete (orders keep their record)                                                                                                                                                                                                  |

Checkout: `PATCH /storefront/checkout { discount_code }` (null removes) → `422` on
`discount_code` with the reason. The view adds `discount_code`, `discounts[]` (`{ id, title,
code, kind, amount_minor }`), `discount_note` and `totals.shipping_discount_minor`
(`totals.shipping_minor` is after it). Placing the order can answer `409 DISCOUNT_USED_UP` if a
limit was reached meanwhile. Order views (customer and admin) include `discounts[]`.

### Sales

See `SALES.md`. Viewing needs `store.read`; everything else `discounts.write`.

| Method & path                     | Notes                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /sales`                      | Sales with `status`, `summary`, product counts (starts/ends due sales first)                          |
| `POST /sales/preview`             | Same body as create; returns counts, skip reasons and example prices. Changes nothing                 |
| `POST /sales`                     | `{ title, value_type, value, target, existing: skip·original·current, rounding, starts_at, ends_at }` |
| `GET /sales/:id`                  | With its items: old, sale and current prices, status (active · restored · kept · removed)             |
| `PATCH /sales/:id`                | Scheduled: same body as create. Running: `{ title, ends_at }` only                                    |
| `POST /sales/:id/end`             | Running: put prices back now (`{ restored, kept[] }`). Scheduled: cancel                              |
| `POST /sales/:id/remove-products` | `{ product_ids }` — their prices go back                                                              |
| `POST /sales/:id/apply-new`       | Adds matching products not in the sale yet                                                            |
| `DELETE /sales/:id`               | Not while running (409)                                                                               |
| `GET /sales/product/:productId`   | The running or scheduled sale a product is in                                                         |
| `GET /internal/cron/sales`        | `Authorization: Bearer $CRON_SECRET`; 404 without it                                                  |

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

### Store builder

See `STORE-BUILDER.md`. Reading needs `store.read`; themes need `themes.write`; menus and pages
need `content.write`.

| Method & path                                                                                      | Notes                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /themes`, `GET /themes/presets`                                                               | The library (a live Foundry theme is created on first use); presets                                                                                            |
| `POST /themes`                                                                                     | `{ preset, name? }` → unpublished theme (max 6, `THEME_LIMIT`)                                                                                                 |
| `GET /themes/:id`                                                                                  | `data` (theme-engine `ThemeData`) and the images it uses                                                                                                       |
| `PUT /themes/:id/data`                                                                             | `{ data }`, validated strictly (422 with `data.*` paths); returns contrast warnings                                                                            |
| `POST /themes/:id/publish`, `…/discard`                                                            | Make live (keeps a version) / drop unpublished edits on the live theme                                                                                         |
| `GET /themes/:id/versions`, `POST …/versions/:v/restore`                                           | History; restore (published right away on the live theme)                                                                                                      |
| `POST /themes/:id/duplicate`, `PATCH /themes/:id`, `DELETE /themes/:id`                            | Copy, rename, delete (not the live theme, 409)                                                                                                                 |
| `POST /themes/:id/preview-link`                                                                    | 1-hour token; open the storefront with `?theme_preview=<token>`                                                                                                |
| `PUT /themes/:id/thumbnail`                                                                        | Multipart `file` (PNG, JPEG or WebP): the theme library picture, sent by the editor; stored as 800 px WebP; `thumbnail_url` on theme summaries                 |
| `GET /themes/:id/sample-content`, `POST /themes/:id/sample-content`                                | Themes with sample products (Noor): progress / add the next batch (repeat until `done`). Needs themes, products (write + publish), collections and media write |
| `GET/POST /menus`, `GET/PUT/DELETE /menus/:id`                                                     | `{ title, handle?, items: [{ id, title, link: { type, id?, url? }, children }] }`                                                                              |
| `GET/POST /pages`, `GET/PUT/DELETE /pages/:id`                                                     | `{ title, handle?, body_html, seo_title, seo_description, published }`                                                                                         |
| `GET /storefront/theme`                                                                            | Live theme (or the draft with `X-Theme-Preview`), images and resolved menus                                                                                    |
| `GET /storefront/pages`, `GET /storefront/pages/:handle`                                           | Published pages (drafts too with a valid preview token)                                                                                                        |
| `GET /theme-templates`                                                                             | Alternate template names in the live theme, per kind                                                                                                           |
| `GET/PUT /theme-templates/:kind/:id`                                                               | `{ template }` for a product, collection or page (kind's write permission)                                                                                     |
| `GET/POST /blogs`, `PUT/DELETE /blogs/:id`                                                         | `{ title, handle? }`; a News blog is created on first use                                                                                                      |
| `GET/POST /articles`, `GET/PUT/DELETE /articles/:id`                                               | `{ blog_id, title, handle?, body_html, excerpt, image_id, author, tags, published, published_at, seo_title, seo_description }`                                 |
| `GET /storefront/blogs`, `GET /storefront/blogs/:handle`, `GET /storefront/blogs/:handle/:article` | Sitemap list; posts (`page`, `page_size`, `tag`); one post                                                                                                     |
| `GET/POST /saved-sections`, `GET/DELETE /saved-sections/:id`                                       | `{ name, section }`, validated like a theme save (max 50); `themes.write` to change                                                                            |
