-- DropIndex
DROP INDEX "collection_products_store_idx";

-- DropIndex
DROP INDEX "product_categories_store_idx";

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "variant_id" UUID,
    "product_title" VARCHAR(200) NOT NULL,
    "variant_title" VARCHAR(255) NOT NULL,
    "sku" VARCHAR(100),
    "option_values" JSONB NOT NULL DEFAULT '[]',
    "quantity" INTEGER NOT NULL,
    "unit_price_minor" BIGINT NOT NULL,
    "tax_minor" BIGINT NOT NULL DEFAULT 0,
    "discount_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_id_number_key" ON "orders"("store_id", "number");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_store_id_product_id_idx" ON "order_items"("store_id", "product_id");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───── Hand-written ─────
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_money_nonneg"
  CHECK ("unit_price_minor" >= 0 AND "tax_minor" >= 0 AND "discount_minor" >= 0);

-- Links to live catalog rows are informational only (products are soft-deleted, but if a row is
-- ever purged the snapshot survives).
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL;

-- Snapshot columns are immutable (PRD §8.8 rule 7, §33 "immutable item and financial snapshots").
-- Only the informational links may change (to NULL, by the FK above).
CREATE FUNCTION "order_items_snapshot_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'order_items are immutable (DELETE not allowed)' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.product_title, NEW.variant_title, NEW.sku, NEW.option_values, NEW.quantity, NEW.unit_price_minor,
      NEW.tax_minor, NEW.discount_minor, NEW.currency, NEW.order_id, NEW.store_id)
     IS DISTINCT FROM
     (OLD.product_title, OLD.variant_title, OLD.sku, OLD.option_values, OLD.quantity, OLD.unit_price_minor,
      OLD.tax_minor, OLD.discount_minor, OLD.currency, OLD.order_id, OLD.store_id) THEN
    RAISE EXCEPTION 'order_items snapshots are immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "order_items_snapshot_guard"
  BEFORE UPDATE OR DELETE ON "order_items"
  FOR EACH ROW EXECUTE FUNCTION "order_items_snapshot_immutable"();
