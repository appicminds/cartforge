-- CreateEnum
CREATE TYPE "InventoryLocationStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('initial', 'received', 'correction', 'damaged', 'shrinkage', 'returned', 'other');

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "continue_selling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inventory_tracking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "media_asset_id" UUID,
ADD COLUMN     "option_signature" VARCHAR(200) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "product_options" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option_values" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "value" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_option_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variant_option_values" (
    "variant_id" UUID NOT NULL,
    "option_value_id" UUID NOT NULL,

    CONSTRAINT "product_variant_option_values_pkey" PRIMARY KEY ("variant_id","option_value_id")
);

-- CreateTable
CREATE TABLE "inventory_locations" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "InventoryLocationStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_levels" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "movement_type" "StockMovementType" NOT NULL,
    "quantity_delta" INTEGER NOT NULL,
    "quantity_before" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "reason" VARCHAR(500),
    "reference_type" VARCHAR(40),
    "reference_id" UUID,
    "actor_id" UUID,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_options_product_id_position_idx" ON "product_options"("product_id", "position");

-- CreateIndex
CREATE INDEX "product_option_values_option_id_position_idx" ON "product_option_values"("option_id", "position");

-- CreateIndex
CREATE INDEX "product_variant_option_values_option_value_id_idx" ON "product_variant_option_values"("option_value_id");

-- CreateIndex
CREATE INDEX "inventory_locations_store_id_idx" ON "inventory_locations"("store_id");

-- CreateIndex
CREATE INDEX "inventory_levels_store_id_on_hand_idx" ON "inventory_levels"("store_id", "on_hand");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_levels_variant_id_location_id_key" ON "inventory_levels"("variant_id", "location_id");

-- CreateIndex
CREATE INDEX "stock_movements_variant_id_created_at_idx" ON "stock_movements"("variant_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_store_id_created_at_idx" ON "stock_movements"("store_id", "created_at");

-- AddForeignKey
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "product_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant_option_values" ADD CONSTRAINT "product_variant_option_values_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant_option_values" ADD CONSTRAINT "product_variant_option_values_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "product_option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───── Hand-written: constraints Prisma can't express ─────

-- Each option-value combination exists once per product among live variants (PRD §8.8 rule 4).
CREATE UNIQUE INDEX "product_variants_product_signature_live_key"
  ON "product_variants" ("product_id", "option_signature") WHERE "deleted_at" IS NULL;

-- Option names unique per product, values unique per option (case-insensitive).
CREATE UNIQUE INDEX "product_options_product_name_key" ON "product_options" ("product_id", lower("name"));
CREATE UNIQUE INDEX "product_option_values_option_value_key" ON "product_option_values" ("option_id", lower("value"));

-- One default location per store.
CREATE UNIQUE INDEX "inventory_locations_one_default_key" ON "inventory_locations" ("store_id") WHERE "is_default";

ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_reserved_nonneg" CHECK ("reserved" >= 0);
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_threshold_nonneg"
  CHECK ("low_stock_threshold" IS NULL OR "low_stock_threshold" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ledger_consistent"
  CHECK ("quantity_after" = "quantity_before" + "quantity_delta");

-- Stock movements are an immutable ledger (PRD §8.8 rule 8, §9 INV-006).
CREATE FUNCTION "stock_movements_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only (% not allowed)', TG_OP USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER "stock_movements_no_update_delete"
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION "stock_movements_immutable"();

-- Variant image must be an asset (product membership is checked by the API).
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_media_asset_fkey"
  FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL;

-- Backfill: a default location per existing store, and a level per existing live variant.
INSERT INTO "inventory_locations" ("id", "store_id", "name", "is_default", "updated_at")
SELECT gen_random_uuid(), s."id", 'Main location', true, now() FROM "stores" s
WHERE NOT EXISTS (SELECT 1 FROM "inventory_locations" l WHERE l."store_id" = s."id" AND l."is_default");

INSERT INTO "inventory_levels" ("id", "store_id", "variant_id", "location_id", "updated_at")
SELECT gen_random_uuid(), v."store_id", v."id", l."id", now()
FROM "product_variants" v JOIN "inventory_locations" l ON l."store_id" = v."store_id" AND l."is_default"
WHERE v."deleted_at" IS NULL
ON CONFLICT DO NOTHING;
