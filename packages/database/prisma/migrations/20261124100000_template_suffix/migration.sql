-- Store builder round 2: alternate theme templates per product, collection and page.
ALTER TABLE "products" ADD COLUMN "template_suffix" VARCHAR(30);
ALTER TABLE "collections" ADD COLUMN "template_suffix" VARCHAR(30);
ALTER TABLE "pages" ADD COLUMN "template_suffix" VARCHAR(30);
ALTER TABLE "products" ADD CONSTRAINT "products_template_suffix_check" CHECK ("template_suffix" IS NULL OR "template_suffix" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "collections" ADD CONSTRAINT "collections_template_suffix_check" CHECK ("template_suffix" IS NULL OR "template_suffix" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "pages" ADD CONSTRAINT "pages_template_suffix_check" CHECK ("template_suffix" IS NULL OR "template_suffix" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
