# Deploying a CartForge demo to Vercel

This sets up a **hosted demo/staging environment**. CartForge itself remains a
self-hosted product (PRD §24); the Docker Compose distribution arrives in Next 10.

```
                     ┌── /admin, /login ──────────► admin pages
Browser ──► cartforge-admin (owns the domain)
                     ├── /api/v1/*, /api/docs ───► cartforge-api (NestJS as a Vercel Function)
                     │                                 ├─► Neon Postgres
                     │                                 └─► Upstash Redis
                     └── everything else ────────► cartforge-storefront (Next.js)
                                                       └─► cartforge-api (server-side, cached)
cartforge-api ──catalog changed──► cartforge-storefront /api/revalidate
```

**One public URL.** People only use the admin project's domain. In the current demo that's
`https://cartforge-app.vercel.app` (`/admin` for the app, `/api/v1` and `/api/docs` for the API,
proxied to the API project). `cartforge.vercel.app` was already taken on Vercel; a custom
domain can be added to `cartforge-admin` at any time (also add it to the API's `ADMIN_ORIGIN`).

Both projects deploy from the same GitHub repo (`appicminds/cartforge`). The browser
only talks to the admin domain, so session cookies stay first-party.

**Not deployed:** the background worker (Vercel can't run long-lived processes). It
only runs a heartbeat today. Sprint 2 (image thumbnails) will need a home for it.

---

## 1. Create the API project

1. Vercel → **Add New… → Project** → import `appicminds/cartforge`.
2. **Project Name:** `cartforge-api`.
3. **Root Directory:** `apps/api`. Leave the framework as **Other**. Build and install
   commands come from `apps/api/vercel.json`. Keep **"Include files outside the root
   directory in the Build Step"** enabled (the default): the function needs the shared
   `packages/*` and the pnpm store at the repo root.
4. Click **Deploy**. The first build **will fail** because there's no database yet.
   That's expected. It creates the project so you can attach storage.

## 2. Add Postgres and Redis

In the `cartforge-api` project → **Storage**:

1. **Create Database → Neon (Postgres)**, pick a region, and connect it to `cartforge-api`
   for all environments. This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
2. **Create Database → Upstash (Redis)**, same region, connect to `cartforge-api`. This
   adds `KV_URL`, which CartForge accepts as its Redis URL. If your integration doesn't
   add `KV_URL`, copy the `rediss://…` connection string from the Upstash console into a
   `REDIS_URL` variable.
3. **Settings → Functions → Function Region:** choose the region closest to the Neon
   database.

## 3. API environment variables

`cartforge-api` → **Settings → Environment Variables** (Production and Preview):

| Name                  | Value                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`      | output of `openssl rand -base64 48`                                                                         |
| `APP_ENCRYPTION_KEY`  | output of `openssl rand -base64 32`                                                                         |
| `ADMIN_ORIGIN`        | `https://cartforge-admin.vercel.app` (the admin URL from step 5; comma-separate several, no trailing slash) |
| `CARTFORGE_DEMO_SEED` | `true` to create the demo stores and users                                                                  |
| `SEED_PASSWORD`       | a private password (≥ 12 characters) for all demo users                                                     |

Generate secrets on your own machine. Never reuse the values in `.env.example`.

Then **Deployments → ⋯ → Redeploy**. The build:

1. builds the API and the shared packages,
2. applies database migrations (`prisma migrate deploy`; it never resets or drops data),
3. upserts the demo data when `CARTFORGE_DEMO_SEED=true`.

Check: `https://cartforge-api.vercel.app/api/v1/health/ready` should return
`{"status":"ok",…}`.

## 4. Create the admin project

1. Vercel → **Add New… → Project** → import `appicminds/cartforge` again.
2. **Project Name:** `cartforge-admin`. This gives the `https://cartforge-admin.vercel.app`
   used in `ADMIN_ORIGIN`. If you choose another name or a custom domain, update
   `ADMIN_ORIGIN` on the API and redeploy it.
3. **Root Directory:** `apps/admin`. The framework is detected as Next.js.
4. **Environment Variables:**

   | Name      | Value                                                  |
   | --------- | ------------------------------------------------------ |
   | `API_URL` | `https://cartforge-api.vercel.app` (no trailing slash) |

5. **Deploy.**

## 5. Create the storefront project (Next 2)

1. Import `appicminds/cartforge` a third time as **`cartforge-storefront`**, Root Directory
   `apps/storefront` (Next.js).
2. Pick one shared secret: `openssl rand -hex 24`. Then set:

   | Project                | Name                           | Value                                                            |
   | ---------------------- | ------------------------------ | ---------------------------------------------------------------- |
   | `cartforge-storefront` | `API_URL`                      | `https://cartforge-api.vercel.app`                               |
   | `cartforge-storefront` | `STOREFRONT_STORE_ID`          | the store to show (demo: `00000000-0000-4000-8000-000000000001`) |
   | `cartforge-storefront` | `STOREFRONT_URL`               | the public URL, e.g. `https://cartforge-app.vercel.app`          |
   | `cartforge-storefront` | `STOREFRONT_REVALIDATE_SECRET` | the secret                                                       |
   | `cartforge-api`        | `STOREFRONT_URL`               | same public URL (used for preview links)                         |
   | `cartforge-api`        | `STOREFRONT_REVALIDATE_URL`    | `https://cartforge-storefront.vercel.app/api/revalidate`         |
   | `cartforge-api`        | `STOREFRONT_REVALIDATE_SECRET` | the secret                                                       |
   | `cartforge-admin`      | `STOREFRONT_ORIGIN`            | `https://cartforge-storefront.vercel.app` (read at build time)   |

3. Redeploy all three. The admin domain now shows the storefront at `/`; the admin is at `/admin`.
4. Optional demo catalog (11 products with illustrations, categories, collections, a variable tee):

   ```bash
   DEMO_API=https://cartforge-app.vercel.app DEMO_EMAIL=owner@cartforge.test DEMO_PASSWORD='<SEED_PASSWORD>' node apps/api/scripts/demo-catalog.mjs
   ```

## 6. Sign in

Open `https://cartforge-app.vercel.app/admin` and sign in as any demo user with your
`SEED_PASSWORD`:

| Email                    | Role                               |
| ------------------------ | ---------------------------------- |
| `owner@cartforge.test`   | Owner of all three demo stores     |
| `admin@cartforge.test`   | Administrator, Northwind Goods     |
| `catalog@cartforge.test` | Catalog Manager, Northwind Goods   |
| `orders@cartforge.test`  | Order Manager (read-only products) |
| `other@cartforge.test`   | Owner of Harbor Outfitters only    |

API docs: `https://cartforge-admin.vercel.app/api/docs`.

Once the demo data exists, you can set `CARTFORGE_DEMO_SEED=false`. Seeding is
idempotent either way, but each run resets the demo users' passwords to `SEED_PASSWORD`.

---

## Known limitations of the Vercel demo

- **Preview deployments of the admin** have their own URLs. Sign-in from them is
  rejected by the CSRF origin check unless that URL is added to `ADMIN_ORIGIN`. Use the
  production admin URL for testing.
- **Migrations run on every API deployment**, including previews, against the same
  database. Fine for a demo; a real staging setup should use a separate Neon branch for
  previews.
- **Login rate limiting** is keyed on email plus client IP. Behind Vercel's proxy chain
  the IP is the proxy's, so in practice the limit applies per email (10 failed attempts
  per 15 minutes).
- **Cold starts:** the first request after a period of inactivity takes a few seconds
  while the API function boots.
- **No worker:** background jobs aren't processed. Nothing depends on them yet.
