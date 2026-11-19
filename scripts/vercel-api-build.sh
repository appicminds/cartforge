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
DATABASE_URL="$MIGRATE_URL" pnpm --filter @cartforge/database exec prisma migrate deploy

if [[ "${CARTFORGE_DEMO_SEED:-false}" == "true" ]]; then
  echo "Loading demo data (CARTFORGE_DEMO_SEED=true)"
  DATABASE_URL="$MIGRATE_URL" pnpm --filter @cartforge/database seed
fi
