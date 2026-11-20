-- CreateEnum
CREATE TYPE "CategoryStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "CollectionType" AS ENUM ('manual', 'automated');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "CollectionSort" AS ENUM ('manual', 'title_asc', 'title_desc', 'price_asc', 'price_desc', 'created_desc', 'created_asc');

-- DropForeignKey
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_media_asset_fkey";

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "handle" VARCHAR(255) NOT NULL,
    "description_html" TEXT NOT NULL DEFAULT '',
    "image_asset_id" UUID,
    "seo_title" VARCHAR(255),
    "seo_description" VARCHAR(500),
    "status" "CategoryStatus" NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("product_id","category_id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "handle" VARCHAR(255) NOT NULL,
    "description_html" TEXT NOT NULL DEFAULT '',
    "image_asset_id" UUID,
    "collection_type" "CollectionType" NOT NULL DEFAULT 'manual',
    "rules_json" JSONB,
    "status" "CollectionStatus" NOT NULL DEFAULT 'draft',
    "sort_order" "CollectionSort" NOT NULL DEFAULT 'manual',
    "seo_title" VARCHAR(255),
    "seo_description" VARCHAR(500),
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_products" (
    "collection_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_products_pkey" PRIMARY KEY ("collection_id","product_id")
);

-- CreateTable
CREATE TABLE "product_tags" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "normalized_name" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_tag_assignments" (
    "product_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "product_tag_assignments_pkey" PRIMARY KEY ("product_id","tag_id")
);

-- CreateTable
CREATE TABLE "url_redirects" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "path_from" VARCHAR(500) NOT NULL,
    "path_to" VARCHAR(500) NOT NULL,
    "resource_type" VARCHAR(40) NOT NULL,
    "resource_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "url_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "resource_type" VARCHAR(40) NOT NULL,
    "resource_id" UUID NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_store_id_parent_id_sort_order_idx" ON "categories"("store_id", "parent_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "categories_store_id_handle_key" ON "categories"("store_id", "handle");

-- CreateIndex
CREATE INDEX "product_categories_category_id_idx" ON "product_categories"("category_id");

-- CreateIndex
CREATE INDEX "collections_store_id_status_idx" ON "collections"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "collections_store_id_handle_key" ON "collections"("store_id", "handle");

-- CreateIndex
CREATE INDEX "collection_products_product_id_idx" ON "collection_products"("product_id");

-- CreateIndex
CREATE INDEX "collection_products_collection_id_position_idx" ON "collection_products"("collection_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "product_tags_store_id_normalized_name_key" ON "product_tags"("store_id", "normalized_name");

-- CreateIndex
CREATE INDEX "product_tag_assignments_tag_id_idx" ON "product_tag_assignments"("tag_id");

-- CreateIndex
CREATE INDEX "url_redirects_store_id_resource_type_resource_id_idx" ON "url_redirects"("store_id", "resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "url_redirects_store_id_path_from_key" ON "url_redirects"("store_id", "path_from");

-- CreateIndex
CREATE INDEX "outbox_events_processed_at_created_at_idx" ON "outbox_events"("processed_at", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_store_id_created_at_idx" ON "outbox_events"("store_id", "created_at");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tags" ADD CONSTRAINT "product_tags_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tag_assignments" ADD CONSTRAINT "product_tag_assignments_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tag_assignments" ADD CONSTRAINT "product_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "product_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───── Hand-written ─────
-- Fast filtering of products by tag/category/collection in admin lists.
CREATE INDEX "product_categories_store_idx" ON "product_categories" ("store_id", "category_id");
CREATE INDEX "collection_products_store_idx" ON "collection_products" ("store_id", "collection_id");
-- A category can't be its own parent (deeper cycles are prevented by the API).
ALTER TABLE "categories" ADD CONSTRAINT "categories_not_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
ALTER TABLE "categories" ADD CONSTRAINT "categories_handle_format" CHECK ("handle" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
ALTER TABLE "collections" ADD CONSTRAINT "collections_handle_format" CHECK ("handle" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
