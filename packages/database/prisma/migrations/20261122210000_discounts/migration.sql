-- Next 8: discount codes and automatic discounts.
CREATE TABLE "discounts" (
  "id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "method" VARCHAR(10) NOT NULL,
  "code" VARCHAR(40),
  "kind" VARCHAR(10) NOT NULL,
  "value_type" VARCHAR(10) NOT NULL DEFAULT 'percent',
  "value" BIGINT NOT NULL DEFAULT 0,
  "target" JSONB NOT NULL,
  "buy" JSONB,
  "min_subtotal_minor" BIGINT,
  "min_quantity" INTEGER,
  "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at" TIMESTAMPTZ(3),
  "usage_limit" INTEGER,
  "once_per_customer" BOOLEAN NOT NULL DEFAULT false,
  "combines" BOOLEAN NOT NULL DEFAULT false,
  "market_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "used_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "discounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "discounts_method_check" CHECK ("method" IN ('code', 'automatic')),
  CONSTRAINT "discounts_kind_check" CHECK ("kind" IN ('order', 'products', 'bxgy', 'shipping')),
  CONSTRAINT "discounts_value_type_check" CHECK ("value_type" IN ('percent', 'fixed')),
  CONSTRAINT "discounts_code_check" CHECK (("method" = 'code') = ("code" IS NOT NULL)),
  CONSTRAINT "discounts_code_upper" CHECK ("code" IS NULL OR "code" = upper("code")),
  CONSTRAINT "discounts_value_check" CHECK ("value" >= 0 AND ("value_type" <> 'percent' OR "value" <= 10000)),
  CONSTRAINT "discounts_used_check" CHECK ("used_count" >= 0 AND ("usage_limit" IS NULL OR "used_count" <= "usage_limit")),
  CONSTRAINT "discounts_dates_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at")
);
CREATE UNIQUE INDEX "discounts_store_id_code_key" ON "discounts"("store_id", "code");
CREATE INDEX "discounts_store_id_method_enabled_idx" ON "discounts"("store_id", "method", "enabled");
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "discount_redemptions" (
  "id" UUID NOT NULL,
  "discount_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "discount_redemptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "discount_redemptions_discount_id_order_id_key" ON "discount_redemptions"("discount_id", "order_id");
CREATE INDEX "discount_redemptions_discount_id_email_idx" ON "discount_redemptions"("discount_id", "email");
ALTER TABLE "discount_redemptions" ADD CONSTRAINT "discount_redemptions_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "checkouts" ADD COLUMN "discount_code" VARCHAR(40);
ALTER TABLE "orders" ADD COLUMN "discounts" JSONB NOT NULL DEFAULT '[]';
