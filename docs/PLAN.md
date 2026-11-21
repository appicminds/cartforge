# CartForge — Engineering Plan

Source of truth for scope: _CartForge Master PRD v1.0_. This document records how
engineering will execute it: the sequence, the technical decisions the PRD leaves
open, and the gaps found while reading it. Task-level breakdown lives in
[`TASKS.md`](./TASKS.md).

## 1. Execution order

| Phase                                    | Outcome                                                                                                                                                                         | Exit gate (PRD §27)                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Sprint 0** — Foundation                | Monorepo, API, admin shell, auth + store-scope primitives, local stack, CI                                                                                                      | Developer logs in with a seeded account, opens a protected admin route, calls a protected store-scoped API |
| **Sprint 1** — Catalog foundation        | Product model, CRUD + list APIs, list screen, basic form                                                                                                                        | Create a draft product, find it in the list, edit it, data persists after refresh                          |
| **Sprint 2** — Media & pricing           | Storage adapter, uploads, gallery, price rules                                                                                                                                  | Multiple images + valid pricing survive an app restart                                                     |
| **Sprint 3** — Variants & inventory      | Options, variant generation, stock levels/movements                                                                                                                             | Variable product with editable variants; inventory movements recorded                                      |
| **Sprint 4** — Organization & publishing | Categories, manual collections, tags, SEO, publish/archive                                                                                                                      | Invalid products cannot publish; drafts/archived excluded from public catalog query                        |
| **Sprint 5** — Hardening & release       | E2E, isolation, concurrency, a11y, docs                                                                                                                                         | Products module accepted; no critical/high defects                                                         |
| Next 1 → Next 11                         | PRD §27.7 sequence (auth hardening → storefront → builder → checkout → payments → orders → customers/shipping/tax → discounts → developer platform → installer/ops → analytics) | Per module, planned after Products acceptance                                                              |

No work on later modules starts before Products Management is accepted.

**Status:** Products Management accepted 2026-11-20. At the product owner's request the storefront
(Next 2) runs next, ahead of auth hardening (Next 1), followed by cart and checkout (Next 4),
then the SaaS platform (P1: sign-up, separate stores, domains, platform admin) and auth hardening
(Next 1: team and invitations, email verification, devices, two-factor sign-in), then order
processing (Next 6) and the Payment Hub (Next 5, Pakistani providers first); see `TASKS.md` and
`PAYMENTS.md`.

## 2. Technical decisions (where the PRD is open)

| Area        | Decision                                                                                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime     | Node 22 LTS, pnpm workspaces, Turborepo, TypeScript 5.9 strict                                                                                                                                                              |
| API         | NestJS 11, REST under `/api/v1`, OpenAPI at `/api/docs`                                                                                                                                                                     |
| DB          | PostgreSQL 16, Prisma 6 (raw SQL allowed for locking/perf)                                                                                                                                                                  |
| Queue       | Redis 7 + BullMQ; `apps/worker` exists from Sprint 0                                                                                                                                                                        |
| Admin       | Next.js 15 App Router, React 19, Tailwind 4, shadcn-style components in `packages/ui`, TanStack Query, React Hook Form + Zod, lucide-react icons                                                                            |
| Validation  | Zod schemas in `packages/validation`, shared by admin and API                                                                                                                                                               |
| Auth        | Argon2id password hashing; opaque session token in an `HttpOnly; SameSite=Lax` cookie (`Secure` in production), stored hashed in `sessions`; rotation on login; double-submit CSRF token for state-changing cookie requests |
| Topology    | Admin and API served from the same origin (`/api/*` proxied — Next rewrite in dev, Caddy in prod) so cookies and CSRF stay simple                                                                                           |
| Store scope | Every store-scoped request sends `X-Store-Id`; `StoreScopeGuard` checks membership; `PermissionsGuard` checks role permissions; repository helpers always filter by `store_id`                                              |
| Errors      | `{ error: { code, message, fields? }, request_id }`; request ID from `X-Request-Id` or generated                                                                                                                            |
| Logging     | Pino (nestjs-pino), redaction of auth headers, cookies, passwords, secrets                                                                                                                                                  |
| Money       | Integer minor units (`*_minor` BIGINT columns) + store currency                                                                                                                                                             |
| IDs         | UUID primary keys everywhere                                                                                                                                                                                                |
| Tests       | Vitest (unit + API integration against a real Postgres), Playwright (E2E)                                                                                                                                                   |
| Rich text   | Tiptap in admin; server-side sanitization (sanitize-html) — Sprint 1                                                                                                                                                        |
| Media       | Storage adapter interface with local-disk and S3/MinIO drivers; sharp derivatives in worker — Sprint 2                                                                                                                      |

## 2a. Editions: SaaS and self-hosted (decision 2026-11-20)

The PRD describes a self-hosted product. The product owner decided CartForge also runs as a
hosted, Shopify-style service, **from the same codebase**. `CARTFORGE_EDITION` selects behaviour:

| Topic              | `saas`                                                        | `self_hosted` (default)                                                             |
| ------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Who creates stores | Anyone, through public sign-up (`SIGNUP_ENABLED`, default on) | Platform administrators only; sign-up off by default                                |
| Store address      | `<handle>.PLATFORM_DOMAIN`, plus verified custom domains      | Same if `PLATFORM_DOMAIN` is set; otherwise one fixed store (`STOREFRONT_STORE_ID`) |
| Platform admin     | Operator staff (`users.is_platform_admin`)                    | The installer                                                                       |
| Billing            | Later; every store starts on plan `trial`                     | None                                                                                |

**Account model (Shopify-style).** A merchant signs up and gets a store. The admin always works
inside one store at a time; one login can own several stores and picks one from **Your stores**.
Stores never share products, orders, customers or settings — isolation is the existing `store_id`
scoping plus `StoreScopeGuard`, which also blocks suspended stores.

**Routing.** One storefront deployment serves every store. Its middleware resolves the request
host through `GET /storefront/resolve` (cached 60 s) and passes the store id to the pages; an
unknown host under `PLATFORM_DOMAIN` gets a 404 "store not available" page and never falls back
to another store. **Preview without a domain:** on the shared fallback address,
`/?store=<handle>` shows any active store (remembered in a cookie, marked with a preview bar and
`noindex`, `?store=` exits). Stores' own domains ignore it. This is how stores are seen before
the platform has a wildcard domain.

**Custom domains.** The merchant adds a hostname, publishes a TXT record
(`_cartforge-verify.<host>` = `cartforge-verify=<token>`) and points the host at
`PLATFORM_CNAME_TARGET`. After verification the domain is attached through a `DomainProvider`
(`none` = the operator's reverse proxy issues certificates on demand via the TLS-check endpoint;
`vercel` = attached to the storefront project through the Vercel API). A hostname can be active
for only one store.

## 3. Product-owner defaults (PRD §32) — override any time

| Open decision                                                          | Default adopted                                                       |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Stores per installation                                                | Multiple; one codebase runs as SaaS or self-hosted (see §2a)          |
| Vendor/brand                                                           | Free text on product; managed entity later                            |
| Variant limits                                                         | Max 3 option dimensions, max 100 variants per product (configurable)  |
| Digital products                                                       | Represented as `requires_shipping=false` + flag; no download delivery |
| Scheduled publishing                                                   | Out of first release                                                  |
| Automated collections                                                  | Out of first release (manual only); `rules_json` column reserved      |
| Currency                                                               | Single store currency                                                 |
| Launch countries, gateways, carriers, tax approach, license, OS matrix | Not needed until their modules; must be decided before those start    |

## 4. PRD gaps and how we resolve them

1. **Storefront acceptance before the storefront exists.** Sprint 4 requires
   "active products appear in the storefront", but the storefront is Next 2.
   → Sprint 4 delivers a **public catalog API** (`/api/v1/storefront/products`)
   that excludes draft/archived products and private fields; the storefront will
   consume it.
2. **Order-snapshot acceptance before orders exist.** → Sprint 5 adds a minimal
   `order_items` snapshot table and a test proving product edits don't mutate it.
   The full orders module extends it later.
3. **Worker needed in Sprint 2 but not listed in Sprint 0.** → minimal
   `apps/worker` is part of Sprint 0.
4. **Data-model inconsistencies in §8.7.**
   - Weight on both product and variant → variant is source of truth; product
     keeps defaults for simple products only.
   - `product_option_values` lacks `store_id` → added.
   - `product_variants.currency` vs single store currency → column kept, always
     equal to store currency, enforced server-side.
   - `media_references` (§26) missing from §8.7 but required for safe deletion →
     added in Sprint 2.
5. **Permissions needed in Sprint 1, auth module is Next 1.** → Sprint 0 ships the
   RBAC primitives (permissions catalog, system roles, guards, seeded users);
   Next 1 adds staff-management UI, MFA, password reset, rate-limit hardening.
6. Company naming: PRD says "Appisminds"; GitHub org is `appicminds`. To confirm.
7. PRD §13.3 list numbering continues from §8.8 (11–17) — cosmetic only.

## 5. Admin design direction

The admin follows the **interaction patterns and density of Shopify Admin** (PRD §5.3) using
CartForge's own component library, tokens, icons (Lucide) and brand colours.

- Adopted: compact 13px type scale, 32px controls, hairline-edged cards, resource lists with
  status view tabs, clickable rows, two-column resource pages, a contextual save bar that
  overlays the top bar while there are unsaved changes, `/` to search, Ctrl/⌘+S to save.
- Not used: Shopify Polaris packages, tokens or icons. Their license only permits use in apps that
  integrate with Shopify; stand-alone apps must be "visually distinct from Shopify products …
  including the internal administration page of a Shopify merchant store". CartForge keeps its
  own visual identity (dark navigation, ember primary, own logo) for that reason and per PRD §5.3.

## 6. Working agreements

- Every task follows PRD §28.1 (ID, objective, FE, BE, DB, API, permissions,
  validation, tests, acceptance) and §28.2 Definition of Done.
- No mock data in production screens; fixtures only in tests.
- Migrations are versioned, committed and tested; never edit an applied migration.
- Scope changes are recorded as PRD change notes, not made silently.
