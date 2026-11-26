-- Picture of each theme's home page, taken by the editor after changes.
ALTER TABLE "themes" ADD COLUMN "thumbnail_url" VARCHAR(1000);
ALTER TABLE "themes" ADD COLUMN "thumbnail_at" TIMESTAMPTZ(3);
