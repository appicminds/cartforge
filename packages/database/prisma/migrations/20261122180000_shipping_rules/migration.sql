-- Next 7: shipping by province/city, order-value limits, per-item charge, delivery estimate.
ALTER TABLE "shipping_methods"
  ADD COLUMN "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "cities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "min_order_minor" BIGINT,
  ADD COLUMN "max_order_minor" BIGINT,
  ADD COLUMN "per_item_minor" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "min_days" INTEGER,
  ADD COLUMN "max_days" INTEGER;

ALTER TABLE "shipping_methods"
  ADD CONSTRAINT "shipping_methods_per_item_nonneg" CHECK ("per_item_minor" >= 0),
  ADD CONSTRAINT "shipping_methods_order_range" CHECK (
    "min_order_minor" IS NULL OR "max_order_minor" IS NULL OR "min_order_minor" <= "max_order_minor"),
  ADD CONSTRAINT "shipping_methods_days_range" CHECK (
    "min_days" IS NULL OR "max_days" IS NULL OR "min_days" <= "max_days");
