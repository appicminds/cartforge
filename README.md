# CartForge

Self-hosted commerce platform — _Build commerce. Own everything._

- Product requirements: CartForge Master PRD v1.0
- Engineering plan & decisions: [`docs/PLAN.md`](docs/PLAN.md)
- Task breakdown & status: [`docs/TASKS.md`](docs/TASKS.md)
- Hosted demo on Vercel: [`docs/DEPLOY-VERCEL.md`](docs/DEPLOY-VERCEL.md)

## Repository layout

```
apps/
  admin/       Next.js admin (App Router, TanStack Query, RHF + Zod)
  storefront/  Next.js storefront: server-rendered catalog, default theme, SEO
  api/         NestJS REST API under /api/v1 (OpenAPI at /api/docs)
  worker/      BullMQ background worker
packages/
  config/      Zod-validated environment loading
  database/    Prisma schema, migrations, client, dev seed
  theme-engine/ Theme settings + section schemas, default theme, CSS compiler
  types/       Shared contracts: permissions, roles, API envelopes
  ui/          Design tokens + React component library
  validation/  Shared Zod schemas (admin + API)
docs/          Plan and task breakdown
```

Further folders from PRD §25.3 (page builder, checkout and payment engines, …) are
added when their module starts.

## Local development

Requirements: Node 22, pnpm 10, Docker (or local PostgreSQL 16 + Redis 7).

```bash
cp .env.example .env
docker compose up -d          # postgres, redis, minio
pnpm install
pnpm build                    # builds shared packages (and apps)
pnpm db:migrate               # apply migrations
pnpm db:seed                  # dev stores + users (refuses in production)
pnpm dev                      # admin :3000, storefront :3100, API :4000, worker
```

Open http://localhost:3000/admin and sign in with a seeded account (the storefront is at
http://localhost:3100; `node apps/api/scripts/demo-catalog.mjs` with `DEMO_PASSWORD` fills it). All seeded users
share the dev-only password `CartForge!dev1`:

| Email                   | Role(s)                                            |
| ----------------------- | -------------------------------------------------- |
| owner@cartforge.test    | Owner of _Northwind Goods_ and _Harbor Outfitters_ |
| admin@cartforge.test    | Administrator, Northwind Goods                     |
| catalog@cartforge.test  | Catalog Manager, Northwind Goods                   |
| orders@cartforge.test   | Order Manager, Northwind Goods                     |
| other@cartforge.test    | Owner of Harbor Outfitters only (isolation tests)  |
| platform@cartforge.test | Platform admin — sees every store                  |

**SaaS mode locally:** set `CARTFORGE_EDITION=saas` and `PLATFORM_DOMAIN=shops.localhost` in
`.env`. Sign up at http://localhost:3000/signup; each store is served at
`http://<handle>.shops.localhost:3100` (browsers resolve `*.localhost` to your machine), e.g.
http://northwind.shops.localhost:3100 and http://harbor.shops.localhost:3100.

API docs: http://localhost:3000/api/docs (proxied to the API).

## Tests

```bash
pnpm test        # unit + API integration (uses a separate <db>_test database)
pnpm test:e2e    # Playwright against the running stack
```

API integration tests run `prisma migrate deploy` against `<DATABASE_URL db>_test`
and upsert seed data; they never reset or drop a database.

## API conventions (summary)

- Session cookie `cf_session` (HttpOnly, SameSite=Lax, Secure in production).
- State-changing requests send `X-CSRF-Token` = value of the `cf_csrf` cookie.
- Store-scoped endpoints require `X-Store-Id`; membership and permissions are checked server-side.
- Errors: `{ "error": { "code", "message", "fields?" }, "request_id" }`.
- Every response carries `X-Request-Id`.
