-- Store builder round 2: blogs and articles.
CREATE TABLE "blogs" (
  "id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "handle" VARCHAR(255) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "blogs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "blogs_handle_check" CHECK ("handle" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX "blogs_store_id_handle_key" ON "blogs"("store_id", "handle");
ALTER TABLE "blogs" ADD CONSTRAINT "blogs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "articles" (
  "id" UUID NOT NULL,
  "store_id" UUID NOT NULL,
  "blog_id" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "handle" VARCHAR(255) NOT NULL,
  "body_html" TEXT NOT NULL DEFAULT '',
  "excerpt" VARCHAR(500) NOT NULL DEFAULT '',
  "image_id" UUID,
  "author" VARCHAR(100),
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "published" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMPTZ(3),
  "seo_title" VARCHAR(200),
  "seo_description" VARCHAR(320),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "articles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "articles_handle_check" CHECK ("handle" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX "articles_blog_id_handle_key" ON "articles"("blog_id", "handle");
CREATE INDEX "articles_store_id_published_published_at_idx" ON "articles"("store_id", "published", "published_at");
ALTER TABLE "articles" ADD CONSTRAINT "articles_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "articles" ADD CONSTRAINT "articles_blog_id_fkey" FOREIGN KEY ("blog_id") REFERENCES "blogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
