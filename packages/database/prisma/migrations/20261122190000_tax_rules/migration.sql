-- Next 7: tax rates by country or province, overriding the store rate.
ALTER TABLE "checkout_settings" ADD COLUMN "tax_rules" JSONB NOT NULL DEFAULT '[]';
