-- Payment Hub (Next 5): provider accounts, verified provider events, online payment fields.
-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "failure_reason" VARCHAR(500),
ADD COLUMN     "mode" VARCHAR(10),
ADD COLUMN     "paid_at" TIMESTAMPTZ(3),
ADD COLUMN     "provider_charge_id" VARCHAR(200);

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "method" VARCHAR(40) NOT NULL DEFAULT 'manual',
ADD COLUMN     "provider_reference" VARCHAR(200);

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "mode" VARCHAR(10) NOT NULL DEFAULT 'test',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "credentials" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "payment_id" UUID,
    "provider" VARCHAR(40) NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "outcome" VARCHAR(20) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "amount_minor" BIGINT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_accounts_store_id_provider_key" ON "payment_accounts"("store_id", "provider");

-- CreateIndex
CREATE INDEX "payment_events_payment_id_idx" ON "payment_events"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_external_id_key" ON "payment_events"("provider", "external_id");

-- CreateIndex
CREATE INDEX "payments_provider_provider_reference_idx" ON "payments"("provider", "provider_reference");

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_mode_check" CHECK ("mode" IN ('test', 'live'));
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_outcome_check"
  CHECK ("outcome" IN ('paid', 'failed', 'canceled', 'refunded', 'pending', 'ignored'));

-- Provider events are evidence: append-only.
CREATE FUNCTION "payment_events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'payment_events are append-only' USING ERRCODE = 'P0001';
END $$;
CREATE TRIGGER "payment_events_guard" BEFORE UPDATE OR DELETE ON "payment_events"
  FOR EACH ROW EXECUTE FUNCTION "payment_events_append_only"();
