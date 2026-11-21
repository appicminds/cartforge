-- Customers (Next 7): store customers, addresses, storefront sessions and tokens.
-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "phone" VARCHAR(30),
    "password_hash" TEXT,
    "accepts_marketing" BOOLEAN NOT NULL DEFAULT false,
    "note" VARCHAR(2000),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "address" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_tokens" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_store_id_created_at_idx" ON "customers"("store_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "customers_store_id_email_key" ON "customers"("store_id", "email");

-- CreateIndex
CREATE INDEX "customer_addresses_customer_id_idx" ON "customer_addresses"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_sessions_token_hash_key" ON "customer_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "customer_sessions_customer_id_idx" ON "customer_sessions"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_tokens_token_hash_key" ON "customer_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "customer_tokens_customer_id_idx" ON "customer_tokens"("customer_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_tokens" ADD CONSTRAINT "customer_tokens_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "customers" ADD CONSTRAINT "customers_email_lowercase" CHECK ("email" = lower("email"));

-- Every existing order gets its customer (by email, per store); earliest order wins the details.
INSERT INTO "customers" ("id", "store_id", "email", "first_name", "last_name", "phone", "created_at", "updated_at")
SELECT DISTINCT ON (o."store_id", lower(o."email"))
  gen_random_uuid(), o."store_id", lower(o."email"),
  NULLIF(COALESCE(o."shipping_address", o."billing_address") ->> 'first_name', ''),
  NULLIF(COALESCE(o."shipping_address", o."billing_address") ->> 'last_name', ''),
  o."phone", o."placed_at", now()
FROM "orders" o
WHERE o."email" IS NOT NULL AND o."email" <> ''
ORDER BY o."store_id", lower(o."email"), o."placed_at" ASC;

UPDATE "orders" o SET "customer_id" = c."id"
FROM "customers" c
WHERE c."store_id" = o."store_id" AND c."email" = lower(o."email") AND o."customer_id" IS NULL;
