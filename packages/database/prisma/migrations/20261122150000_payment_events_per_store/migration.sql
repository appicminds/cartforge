-- Provider messages are recorded once per store (two stores may see the same reference).
DROP INDEX "payment_events_provider_external_id_key";
CREATE UNIQUE INDEX "payment_events_store_id_provider_external_id_key" ON "payment_events"("store_id", "provider", "external_id");
