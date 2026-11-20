-- CreateEnum
CREATE TYPE "DomainKind" AS ENUM ('platform', 'custom');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('pending', 'active');

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "handle" VARCHAR(63),
ADD COLUMN     "plan" VARCHAR(40) NOT NULL DEFAULT 'trial',
ADD COLUMN     "suspended_at" TIMESTAMPTZ(3),
ADD COLUMN     "suspension_reason" VARCHAR(500);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "store_domains" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "hostname" VARCHAR(253) NOT NULL,
    "kind" "DomainKind" NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'pending',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "verification_token" VARCHAR(64) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_domains_hostname_key" ON "store_domains"("hostname");

-- CreateIndex
CREATE INDEX "store_domains_store_id_idx" ON "store_domains"("store_id");

-- Backfill handles for existing stores: slug of the name, de-duplicated with a short id suffix.
WITH slugs AS (
  SELECT id,
         COALESCE(NULLIF(trim(both '-' from left(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), 50)), ''), 'store') AS slug
  FROM "stores"
), ranked AS (
  SELECT id, slug, row_number() OVER (PARTITION BY slug ORDER BY id) AS n FROM slugs
)
UPDATE "stores" s
SET "handle" = CASE WHEN r.n = 1 THEN r.slug ELSE r.slug || '-' || left(replace(s.id::text, '-', ''), 6) END
FROM ranked r WHERE r.id = s.id;
ALTER TABLE "stores" ALTER COLUMN "handle" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "stores_handle_key" ON "stores"("handle");

-- AddForeignKey
ALTER TABLE "store_domains" ADD CONSTRAINT "store_domains_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───── Hand-written ─────
-- Handles are subdomain labels: lowercase letters, digits, single hyphens, 3–63 chars.
ALTER TABLE "stores" ADD CONSTRAINT "stores_handle_format"
  CHECK ("handle" ~ '^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$');
ALTER TABLE "store_domains" ADD CONSTRAINT "store_domains_hostname_lower" CHECK ("hostname" = lower("hostname"));
-- At most one primary domain per store.
CREATE UNIQUE INDEX "store_domains_one_primary" ON "store_domains" ("store_id") WHERE "is_primary";
