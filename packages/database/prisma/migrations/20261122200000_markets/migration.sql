-- Markets: sell to several countries, each in its own currency.
CREATE TABLE "markets" (
  "id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "name" VARCHAR(60) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "countries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "pricing_mode" VARCHAR(10) NOT NULL DEFAULT 'manual',
  "manual_rate" DECIMAL(24,10),
  "adjustment_bps" INTEGER NOT NULL DEFAULT 0,
  "rounding" VARCHAR(10) NOT NULL DEFAULT 'none',
  "payment_methods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "markets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "markets_pricing_mode_check" CHECK ("pricing_mode" IN ('manual', 'live')),
  CONSTRAINT "markets_rounding_check" CHECK ("rounding" IN ('none', 'whole', 'x99', 'x9', 'five', 'ten')),
  CONSTRAINT "markets_manual_rate_check" CHECK ("manual_rate" IS NULL OR "manual_rate" > 0)
);
CREATE UNIQUE INDEX "markets_store_id_name_key" ON "markets"("store_id", "name");
CREATE INDEX "markets_store_id_idx" ON "markets"("store_id");
-- One primary market per store.
CREATE UNIQUE INDEX "markets_one_primary" ON "markets"("store_id") WHERE "is_primary";
ALTER TABLE "markets" ADD CONSTRAINT "markets_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "market_prices" (
  "market_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL,
  "price_minor" BIGINT NOT NULL,
  "compare_at_minor" BIGINT,
  CONSTRAINT "market_prices_pkey" PRIMARY KEY ("market_id", "variant_id"),
  CONSTRAINT "market_prices_nonneg" CHECK ("price_minor" >= 0 AND ("compare_at_minor" IS NULL OR "compare_at_minor" >= 0))
);
CREATE INDEX "market_prices_variant_id_idx" ON "market_prices"("variant_id");
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "fx_rates" (
  "base" CHAR(3) NOT NULL,
  "quote" CHAR(3) NOT NULL,
  "rate" DECIMAL(24,10) NOT NULL,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("base", "quote")
);

ALTER TABLE "products" ADD COLUMN "hidden_market_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE "carts" ADD COLUMN "market_id" UUID;
ALTER TABLE "orders"
  ADD COLUMN "market_id" UUID,
  ADD COLUMN "fx_rate" DECIMAL(24,10),
  ADD COLUMN "store_currency" CHAR(3),
  ADD COLUMN "store_total_minor" BIGINT;

-- Existing orders were all in the store's currency.
UPDATE "orders" o SET "store_currency" = o."currency", "store_total_minor" = o."total_minor", "fx_rate" = 1;
