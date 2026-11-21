-- Mobile wallet / Raast transfer payment method (Next 5).
ALTER TABLE "checkout_settings"
  ADD COLUMN "wallet_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "wallet_jazzcash" VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN "wallet_easypaisa" VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN "wallet_raast_id" VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN "wallet_iban" VARCHAR(34) NOT NULL DEFAULT '',
  ADD COLUMN "wallet_account_title" VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN "wallet_note" VARCHAR(500) NOT NULL DEFAULT '';
