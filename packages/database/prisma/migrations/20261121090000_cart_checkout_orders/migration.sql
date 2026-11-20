-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'processing', 'on_hold', 'completed', 'canceled', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'authorized', 'paid', 'partially_refunded', 'refunded', 'voided', 'failed');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('unfulfilled', 'partially_fulfilled', 'fulfilled');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('active', 'converted');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('open', 'completed');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('active', 'released', 'consumed', 'expired');

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'sale';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "access_key_hash" CHAR(64),
ADD COLUMN     "billing_address" JSONB,
ADD COLUMN     "checkout_id" UUID,
ADD COLUMN     "custom_fields" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "customer_id" UUID,
ADD COLUMN     "discount_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "email" VARCHAR(254),
ADD COLUMN     "fulfillment_status" "FulfillmentStatus" NOT NULL DEFAULT 'unfulfilled',
ADD COLUMN     "payment_method" VARCHAR(40),
ADD COLUMN     "payment_method_label" VARCHAR(80),
ADD COLUMN     "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "phone" VARCHAR(30),
ADD COLUMN     "placed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "prices_include_tax" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shipping_address" JSONB,
ADD COLUMN     "shipping_method" JSONB,
ADD COLUMN     "shipping_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "source" VARCHAR(20) NOT NULL DEFAULT 'storefront',
ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "subtotal_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "tax_label" VARCHAR(40),
ADD COLUMN     "tax_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "terms_accepted_at" TIMESTAMPTZ(3),
ADD COLUMN     "total_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider_reference" VARCHAR(200),
    "instructions" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'active',
    "customer_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_lines" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "seen_price_minor" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkouts" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'open',
    "email" VARCHAR(254),
    "phone" VARCHAR(30),
    "shipping_address" JSONB,
    "billing_address" JSONB,
    "shipping_method_id" UUID,
    "payment_method" VARCHAR(40),
    "custom_fields" JSONB NOT NULL DEFAULT '{}',
    "terms_accepted" BOOLEAN NOT NULL DEFAULT false,
    "reserved_until" TIMESTAMPTZ(3),
    "order_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_settings" (
    "store_id" UUID NOT NULL,
    "tax_rate_bps" INTEGER NOT NULL DEFAULT 0,
    "tax_label" VARCHAR(40) NOT NULL DEFAULT 'Tax',
    "prices_include_tax" BOOLEAN NOT NULL DEFAULT false,
    "tax_shipping" BOOLEAN NOT NULL DEFAULT false,
    "phone" VARCHAR(10) NOT NULL DEFAULT 'optional',
    "reservation_minutes" INTEGER NOT NULL DEFAULT 15,
    "terms_required" BOOLEAN NOT NULL DEFAULT false,
    "terms_label" VARCHAR(200) NOT NULL DEFAULT 'I agree to the terms of service',
    "terms_url" VARCHAR(500) NOT NULL DEFAULT '',
    "custom_fields" JSONB NOT NULL DEFAULT '[]',
    "cod_enabled" BOOLEAN NOT NULL DEFAULT false,
    "cod_instructions" VARCHAR(1000) NOT NULL DEFAULT '',
    "bank_transfer_enabled" BOOLEAN NOT NULL DEFAULT false,
    "bank_transfer_instructions" VARCHAR(1000) NOT NULL DEFAULT '',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checkout_settings_pkey" PRIMARY KEY ("store_id")
);

-- CreateTable
CREATE TABLE "shipping_methods" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(200),
    "price_minor" BIGINT NOT NULL,
    "free_over_minor" BIGINT,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipping_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "scope" VARCHAR(60) NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status_code" INTEGER,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_sequences" (
    "store_id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "store_sequences_pkey" PRIMARY KEY ("store_id","name")
);

-- CreateIndex
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_token_hash_key" ON "carts"("token_hash");

-- CreateIndex
CREATE INDEX "carts_store_id_updated_at_idx" ON "carts"("store_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "cart_lines_cart_id_variant_id_key" ON "cart_lines"("cart_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_cart_id_key" ON "checkouts"("cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_order_id_key" ON "checkouts"("order_id");

-- CreateIndex
CREATE INDEX "inventory_reservations_checkout_id_idx" ON "inventory_reservations"("checkout_id");

-- CreateIndex
CREATE INDEX "inventory_reservations_store_id_status_expires_at_idx" ON "inventory_reservations"("store_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "shipping_methods_store_id_position_idx" ON "shipping_methods"("store_id", "position");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_store_id_scope_key_key" ON "idempotency_keys"("store_id", "scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "orders_checkout_id_key" ON "orders"("checkout_id");

-- CreateIndex
CREATE INDEX "orders_store_id_placed_at_idx" ON "orders"("store_id", "placed_at");

-- CreateIndex
CREATE INDEX "orders_store_id_status_placed_at_idx" ON "orders"("store_id", "status", "placed_at");

-- CreateIndex
CREATE INDEX "orders_store_id_email_idx" ON "orders"("store_id", "email");

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "inventory_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_checkout_id_fkey" FOREIGN KEY ("checkout_id") REFERENCES "checkouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───── Hand-written ─────
-- (Prisma doesn't model these; keep them when regenerating: order_items FKs from
-- 20261120132043 must not be dropped either.)

ALTER TABLE "cart_lines" ADD CONSTRAINT "cart_lines_quantity_range" CHECK ("quantity" BETWEEN 1 AND 999);
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "shipping_methods" ADD CONSTRAINT "shipping_methods_money_nonneg"
  CHECK ("price_minor" >= 0 AND ("free_over_minor" IS NULL OR "free_over_minor" >= 0));
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_nonneg" CHECK ("amount_minor" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_money_nonneg"
  CHECK ("subtotal_minor" >= 0 AND "discount_minor" >= 0 AND "shipping_minor" >= 0
         AND "tax_minor" >= 0 AND "total_minor" >= 0);
ALTER TABLE "checkout_settings" ADD CONSTRAINT "checkout_settings_ranges"
  CHECK ("tax_rate_bps" BETWEEN 0 AND 10000 AND "reservation_minutes" BETWEEN 5 AND 120
         AND "phone" IN ('hidden', 'optional', 'required'));
ALTER TABLE "inventory_levels" DROP CONSTRAINT IF EXISTS "inventory_levels_reserved_nonneg";
ALTER TABLE "inventory_levels" ADD CONSTRAINT "inventory_levels_reserved_nonneg" CHECK ("reserved" >= 0);

-- An order's money, currency and number never change after it is placed (PRD §13.3 rule 14,
-- §33 immutable financial snapshots). Status columns stay writable for payments/fulfillment.
CREATE FUNCTION "orders_financials_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'orders cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.store_id, NEW.number, NEW.currency, NEW.subtotal_minor, NEW.discount_minor, NEW.shipping_minor,
      NEW.tax_minor, NEW.total_minor, NEW.prices_include_tax, NEW.tax_rate_bps, NEW.placed_at)
     IS DISTINCT FROM
     (OLD.store_id, OLD.number, OLD.currency, OLD.subtotal_minor, OLD.discount_minor, OLD.shipping_minor,
      OLD.tax_minor, OLD.total_minor, OLD.prices_include_tax, OLD.tax_rate_bps, OLD.placed_at) THEN
    RAISE EXCEPTION 'order financial snapshots are immutable' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "orders_financials_guard"
  BEFORE UPDATE OR DELETE ON "orders"
  FOR EACH ROW EXECUTE FUNCTION "orders_financials_immutable"();

-- Order timeline is append-only.
CREATE FUNCTION "order_events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'order_events are append-only' USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER "order_events_guard"
  BEFORE UPDATE OR DELETE ON "order_events"
  FOR EACH ROW EXECUTE FUNCTION "order_events_append_only"();
