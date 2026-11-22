-- Store builder (Next 3): themes with published versions, menus and content pages.
CREATE TABLE "themes" (
  "id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "preset" VARCHAR(20) NOT NULL,
  "role" VARCHAR(12) NOT NULL DEFAULT 'unpublished',
  "data" JSONB NOT NULL,
  "live_data" JSONB,
  "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "themes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "themes_role_check" CHECK ("role" IN ('live', 'unpublished')),
  CONSTRAINT "themes_live_has_data" CHECK ("role" <> 'live' OR "live_data" IS NOT NULL)
);
CREATE INDEX "themes_store_id_role_idx" ON "themes"("store_id", "role");
-- One live theme per store.
CREATE UNIQUE INDEX "themes_one_live_per_store" ON "themes"("store_id") WHERE "role" = 'live';
ALTER TABLE "themes" ADD CONSTRAINT "themes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "theme_versions" (
  "id" UUID NOT NULL,
  "theme_id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "data" JSONB NOT NULL,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "theme_versions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "theme_versions_theme_id_created_at_idx" ON "theme_versions"("theme_id", "created_at");
ALTER TABLE "theme_versions" ADD CONSTRAINT "theme_versions_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "menus" (
  "id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "handle" VARCHAR(60) NOT NULL,
  "title" VARCHAR(80) NOT NULL,
  "items" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "menus_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "menus_handle_check" CHECK ("handle" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX "menus_store_id_handle_key" ON "menus"("store_id", "handle");
ALTER TABLE "menus" ADD CONSTRAINT "menus_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pages" (
  "id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "handle" VARCHAR(255) NOT NULL,
  "body_html" TEXT NOT NULL DEFAULT '',
  "seo_title" VARCHAR(200),
  "seo_description" VARCHAR(320),
  "published" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "pages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pages_handle_check" CHECK ("handle" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX "pages_store_id_handle_key" ON "pages"("store_id", "handle");
ALTER TABLE "pages" ADD CONSTRAINT "pages_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
