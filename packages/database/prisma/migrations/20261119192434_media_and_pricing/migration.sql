-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('processing', 'ready', 'failed');

-- DropIndex
DROP INDEX "product_variants_sku_trgm_idx";

-- DropIndex
DROP INDEX "products_title_trgm_idx";

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "compare_at_minor" BIGINT,
ADD COLUMN     "cost_minor" BIGINT,
ADD COLUMN     "currency" CHAR(3),
ADD COLUMN     "price_minor" BIGINT;

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "storage_driver" VARCHAR(20) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "url" VARCHAR(1000) NOT NULL,
    "original_filename" VARCHAR(255),
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "checksum_sha256" CHAR(64) NOT NULL,
    "alt_text" VARCHAR(500),
    "status" "MediaStatus" NOT NULL DEFAULT 'ready',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_derivatives" (
    "id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "url" VARCHAR(1000) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_derivatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_references" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "resource_type" VARCHAR(40) NOT NULL,
    "resource_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "alt_text" VARCHAR(500),

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_assets_store_id_created_at_idx" ON "media_assets"("store_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_derivatives_media_asset_id_name_key" ON "media_derivatives"("media_asset_id", "name");

-- CreateIndex
CREATE INDEX "media_references_store_id_resource_type_resource_id_idx" ON "media_references"("store_id", "resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_references_media_asset_id_resource_type_resource_id_key" ON "media_references"("media_asset_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "product_media_product_id_position_idx" ON "product_media"("product_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "product_media_product_id_media_asset_id_key" ON "product_media"("product_id", "media_asset_id");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_derivatives" ADD CONSTRAINT "media_derivatives_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_references" ADD CONSTRAINT "media_references_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───── Hand-written: constraints Prisma can't express ─────

-- One stored binary per store and checksum among live assets (dedupe, PRD §8.4 B).
CREATE UNIQUE INDEX "media_assets_store_checksum_live_key"
  ON "media_assets" ("store_id", "checksum_sha256") WHERE "deleted_at" IS NULL;

-- At most one primary image per product.
CREATE UNIQUE INDEX "product_media_one_primary_key"
  ON "product_media" ("product_id") WHERE "is_primary";

-- Money is never negative (BE-005).
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_nonneg"
  CHECK ("price_minor" IS NULL OR "price_minor" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_compare_at_nonneg"
  CHECK ("compare_at_minor" IS NULL OR "compare_at_minor" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_cost_nonneg"
  CHECK ("cost_minor" IS NULL OR "cost_minor" >= 0);

-- Existing variants take their store's currency.
UPDATE "product_variants" v SET "currency" = s."currency" FROM "stores" s WHERE s."id" = v."store_id" AND v."currency" IS NULL;
