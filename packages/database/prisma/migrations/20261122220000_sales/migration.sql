-- Sales: bulk price changes written to variants, with the old prices kept to put back.
CREATE TABLE "sales" (
  "id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "value_type" VARCHAR(10) NOT NULL DEFAULT 'percent',
  "value" BIGINT NOT NULL,
  "target" JSONB NOT NULL,
  "existing" VARCHAR(10) NOT NULL DEFAULT 'skip',
  "rounding" VARCHAR(10) NOT NULL DEFAULT 'none',
  "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at" TIMESTAMPTZ(3),
  "status" VARCHAR(10) NOT NULL DEFAULT 'scheduled',
  "started_at" TIMESTAMPTZ(3),
  "ended_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "sales_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_value_type_check" CHECK ("value_type" IN ('percent', 'fixed')),
  CONSTRAINT "sales_value_check" CHECK ("value" > 0 AND ("value_type" <> 'percent' OR "value" < 10000)),
  CONSTRAINT "sales_existing_check" CHECK ("existing" IN ('skip', 'original', 'current')),
  CONSTRAINT "sales_rounding_check" CHECK ("rounding" IN ('none', 'whole', 'x9', 'ten', 'hundred')),
  CONSTRAINT "sales_status_check" CHECK ("status" IN ('scheduled', 'running', 'ended', 'canceled')),
  CONSTRAINT "sales_dates_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at")
);
CREATE INDEX "sales_store_id_status_idx" ON "sales"("store_id", "status");
ALTER TABLE "sales" ADD CONSTRAINT "sales_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sale_items" (
  "id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "old_price_minor" BIGINT NOT NULL,
  "old_compare_minor" BIGINT,
  "sale_price_minor" BIGINT NOT NULL,
  "sale_compare_minor" BIGINT NOT NULL,
  "status" VARCHAR(10) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMPTZ(3),
  CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_items_status_check" CHECK ("status" IN ('active', 'restored', 'kept', 'removed'))
);
CREATE INDEX "sale_items_sale_id_status_idx" ON "sale_items"("sale_id", "status");
CREATE INDEX "sale_items_store_id_product_id_idx" ON "sale_items"("store_id", "product_id");
CREATE INDEX "sale_items_variant_id_idx" ON "sale_items"("variant_id");
-- A variant is in at most one running sale.
CREATE UNIQUE INDEX "sale_items_one_active_per_variant" ON "sale_items"("variant_id") WHERE "status" = 'active';
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New permission: manage discounts and sales (owners and administrators get it).
UPDATE "roles" SET "permissions" = array_append("permissions", 'discounts.write')
WHERE "key" IN ('owner', 'admin') AND NOT ('discounts.write' = ANY("permissions"));
