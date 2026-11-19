#!/usr/bin/env bash
# Build step for the `cartforge-api` Vercel project (Root Directory: apps/api).
# 1. Build the API and the workspace packages it depends on.
# 2. Apply pending migrations (non-destructive `migrate deploy`) using the direct,
#    non-pooled connection when the Neon integration provides one.
# 3. Optionally load demo stores/users (CARTFORGE_DEMO_SEED=true + SEED_PASSWORD).
set -euo pipefail

pnpm turbo run build --filter=@cartforge/api

MIGRATE_URL="${DATABASE_URL_UNPOOLED:-${DATABASE_URL:-}}"
if [[ -z "$MIGRATE_URL" ]]; then
  echo "DATABASE_URL is not set — add the Neon integration or set it in Project Settings → Environment Variables." >&2
  exit 1
fi
# Serverless Postgres (e.g. Neon) may be suspended and take a few seconds to wake:
# allow a longer connect timeout and retry a few times before failing the build.
case "$MIGRATE_URL" in *connect_timeout=*) ;; *\?*) MIGRATE_URL="$MIGRATE_URL&connect_timeout=30" ;; *) MIGRATE_URL="$MIGRATE_URL?connect_timeout=30" ;; esac
for attempt in 1 2 3; do
  if DATABASE_URL="$MIGRATE_URL" pnpm --filter @cartforge/database exec prisma migrate deploy; then break; fi
  if [[ $attempt == 3 ]]; then echo "Migrations failed after 3 attempts" >&2; exit 1; fi
  echo "Database not reachable yet (attempt $attempt); retrying in 10s…" >&2
  sleep 10
done

if [[ "${CARTFORGE_DEMO_SEED:-false}" == "true" ]]; then
  echo "Loading demo data (CARTFORGE_DEMO_SEED=true)"
  DATABASE_URL="$MIGRATE_URL" pnpm --filter @cartforge/database seed
fi
