-- Store builder: sections saved for reuse.
CREATE TABLE "saved_sections" (
  "id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "type" VARCHAR(40) NOT NULL,
  "data" JSONB NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_sections_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "saved_sections_store_id_created_at_idx" ON "saved_sections"("store_id", "created_at");
ALTER TABLE "saved_sections" ADD CONSTRAINT "saved_sections_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
