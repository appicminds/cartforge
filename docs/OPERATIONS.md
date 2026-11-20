# Operations — Products Management

For the Vercel deployment specifically, see `DEPLOY-VERCEL.md`. This page is the general runbook.

## Components

| Component      | What it is                                                                                            | Needs                |
| -------------- | ----------------------------------------------------------------------------------------------------- | -------------------- |
| `apps/api`     | NestJS REST API (`/api/v1`) — long-running (`node dist/main.js`) or serverless (`dist/serverless.js`) | PostgreSQL 16, Redis |
| `apps/admin`   | Next.js admin; `/api/*` is rewritten to the API, so cookies stay first-party                          | `API_URL`            |
| `apps/worker`  | BullMQ worker (scaffold; outbox delivery and async media come later)                                  | Redis, PostgreSQL    |
| Object storage | `local` disk, `s3` (any S3-compatible), or `vercel-blob`                                              | per driver           |

## Environment variables (API)

| Variable                                                                                                               | Required    | Notes                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                         | yes         | PostgreSQL connection string (pooled URL is fine; migrations use it too)               |
| `REDIS_URL`                                                                                                            | yes         | Rate limits and queues. `rediss://` for TLS                                            |
| `SESSION_SECRET`                                                                                                       | yes         | ≥ 32 chars random (`openssl rand -base64 48`). Rotating it signs everyone out          |
| `APP_ENCRYPTION_KEY`                                                                                                   | yes         | 32 bytes, base64 (`openssl rand -base64 32`); encrypts integration secrets at rest     |
| `SESSION_TTL_HOURS`                                                                                                    | no          | Default 168 (7 days)                                                                   |
| `ADMIN_ORIGIN`                                                                                                         | yes         | Comma-separated admin origins; used for CORS and the CSRF origin check                 |
| `COOKIE_SECURE`                                                                                                        | no          | Defaults to `true` in production. Only set `false` for plain-HTTP local runs           |
| `API_PORT`                                                                                                             | no          | Default 4000 (long-running mode)                                                       |
| `NODE_ENV`, `LOG_LEVEL`                                                                                                | no          | Logs are JSON (pino) with request ids; secrets and cookies are redacted                |
| `STORAGE_DRIVER`                                                                                                       | no          | `local` (default) · `s3` · `vercel-blob`                                               |
| `STORAGE_LOCAL_PATH`                                                                                                   | local       | Directory for uploads; files served from `/api/v1/media/files/…`                       |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_BASE_URL` | s3          | Public base URL is what image URLs are built from (CDN in front of the bucket)         |
| `BLOB_READ_WRITE_TOKEN`                                                                                                | vercel-blob | Added automatically when a Blob store is connected to the project                      |
| `MEDIA_MAX_BYTES`                                                                                                      | no          | Upload cap. Default 10 MB; **4 MB on Vercel** (serverless request body limit ≈ 4.5 MB) |
| `CARTFORGE_DEMO_SEED`, `SEED_PASSWORD`                                                                                 | demo only   | Seeds demo stores and users. Password ≥ 12 chars. Never set on a real store            |

Admin: `API_URL` (where `/api/*` is forwarded).

The API validates its environment on boot and exits with a list of what is wrong.

## Database

- Migrations live in `packages/database/prisma/migrations` and are **forward-only**. Apply with
  `pnpm --filter @cartforge/database exec prisma migrate deploy` (the Vercel build does this).
- Never run `migrate reset` or `db push` against a shared database.
- Invariants enforced by the database itself, not only the app:
  - store-scoped partial unique indexes on product handle, SKU, variant option signature, media checksum
  - `CHECK` constraints on money (non-negative, compare-at > price)
  - triggers making `stock_movements` append-only and `order_items` snapshots immutable
- Seed (`pnpm db:seed`) is idempotent: roles and permissions always; demo data only with `CARTFORGE_DEMO_SEED=true`.

### Backups

Use the provider's point-in-time recovery (Neon, RDS, Cloud SQL…) with at least 7 days of retention, and
test a restore before go-live. Media lives in object storage — enable versioning or replication on the
bucket; database rows reference files by key, so restore both to the same point in time when possible.

## Health checks and monitoring

- `GET /api/v1/health` — process is up (liveness).
- `GET /api/v1/health/ready` — database and Redis reachable (readiness; use for load balancers and uptime monitors).
- Every response carries `X-Request-Id`; 5xx errors are logged with it, and users see it in error toasts,
  so a support ticket can be traced to a log line.

## Routine tasks

| Task                                   | How                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Reset a user's password (demo)         | Change `SEED_PASSWORD`, redeploy (seed updates demo users)                                      |
| Revoke all sessions                    | Rotate `SESSION_SECRET`                                                                         |
| Check performance after schema changes | `RUN_PERF=1 pnpm --filter @cartforge/api exec vitest run test/perf` (see `PERFORMANCE.md`)      |
| Orphaned media                         | Media not attached to any product stays in the library; delete via admin or `DELETE /media/:id` |

## Security checklist before a real launch

- [ ] Rotate every credential that was ever pasted into chat, tickets or logs (database password, Redis token)
- [ ] `CARTFORGE_DEMO_SEED` unset; demo users removed
- [ ] `SESSION_SECRET` unique per environment
- [ ] `ADMIN_ORIGIN` lists only real admin origins
- [ ] Database backups and a tested restore
- [ ] Object storage not publicly listable (only object reads are public)
