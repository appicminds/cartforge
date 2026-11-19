-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('simple', 'variable');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description_html" TEXT NOT NULL DEFAULT '',
    "handle" VARCHAR(255) NOT NULL,
    "product_type" "ProductType" NOT NULL DEFAULT 'simple',
    "vendor" VARCHAR(120),
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "requires_shipping" BOOLEAN NOT NULL DEFAULT true,
    "seo_title" VARCHAR(255),
    "seo_description" VARCHAR(500),
    "published_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL DEFAULT 'Default',
    "sku" VARCHAR(100),
    "barcode" VARCHAR(100),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_store_id_status_updated_at_idx" ON "products"("store_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "products_store_id_updated_at_idx" ON "products"("store_id", "updated_at");

-- CreateIndex
CREATE INDEX "products_store_id_created_at_idx" ON "products"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "products_store_id_title_idx" ON "products"("store_id", "title");

-- CreateIndex
CREATE INDEX "product_variants_product_id_position_idx" ON "product_variants"("product_id", "position");

-- CreateIndex
CREATE INDEX "product_variants_store_id_barcode_idx" ON "product_variants"("store_id", "barcode");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───── Hand-written: constraints Prisma can't express ─────

-- Handle unique per store among live (non-deleted) products (PRD §8.8 rule 3).
CREATE UNIQUE INDEX "products_store_handle_live_key"
  ON "products" ("store_id", "handle") WHERE "deleted_at" IS NULL;

-- SKU unique per store when present, among live variants (PRD §8.8 rule 3).
CREATE UNIQUE INDEX "product_variants_store_sku_live_key"
  ON "product_variants" ("store_id", "sku") WHERE "sku" IS NOT NULL AND "deleted_at" IS NULL;

-- Server-side search on title (ILIKE '%q%') stays indexed on large catalogs.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "products_title_trgm_idx" ON "products" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "product_variants_sku_trgm_idx" ON "product_variants" USING GIN ("sku" gin_trgm_ops);

-- Defensive integrity checks.
ALTER TABLE "products" ADD CONSTRAINT "products_title_not_blank" CHECK (length(btrim("title")) > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_handle_format"
  CHECK ("handle" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
