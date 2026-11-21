-- Order processing (Next 6): fulfillments, refunds, cancellation.
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancel_reason" VARCHAR(40),
ADD COLUMN     "canceled_at" TIMESTAMPTZ(3),
ADD COLUMN     "refunded_minor" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "fulfillments" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "tracking_company" VARCHAR(80),
    "tracking_number" VARCHAR(120),
    "tracking_url" VARCHAR(500),
    "shipped_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfillments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fulfillment_items" (
    "id" UUID NOT NULL,
    "fulfillment_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "fulfillment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" VARCHAR(500),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_items" (
    "id" UUID NOT NULL,
    "refund_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "restocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "refund_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fulfillments_store_id_order_id_idx" ON "fulfillments"("store_id", "order_id");

-- CreateIndex
CREATE INDEX "fulfillment_items_order_item_id_idx" ON "fulfillment_items"("order_item_id");

-- CreateIndex
CREATE INDEX "refunds_store_id_order_id_idx" ON "refunds"("store_id", "order_id");

-- CreateIndex
CREATE INDEX "refund_items_order_item_id_idx" ON "refund_items"("order_item_id");

-- AddForeignKey
ALTER TABLE "fulfillments" ADD CONSTRAINT "fulfillments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_items" ADD CONSTRAINT "fulfillment_items_fulfillment_id_fkey" FOREIGN KEY ("fulfillment_id") REFERENCES "fulfillments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fulfillment_items" ADD CONSTRAINT "fulfillment_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Guards (the app checks these too).
ALTER TABLE "fulfillment_items" ADD CONSTRAINT "fulfillment_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_non_negative" CHECK ("amount_minor" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_within_total"
  CHECK ("refunded_minor" >= 0 AND "refunded_minor" <= "total_minor");

-- Refunds are financial records: append-only, like the order timeline.
CREATE FUNCTION "refunds_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'refunds are append-only' USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER "refunds_guard" BEFORE UPDATE OR DELETE ON "refunds"
  FOR EACH ROW EXECUTE FUNCTION "refunds_append_only"();
CREATE TRIGGER "refund_items_guard" BEFORE UPDATE OR DELETE ON "refund_items"
  FOR EACH ROW EXECUTE FUNCTION "refunds_append_only"();
