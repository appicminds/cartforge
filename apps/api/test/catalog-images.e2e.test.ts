import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_STORES } from "@cartforge/database/seed";
import { api, createTestApp, login, RUN, type Session } from "./app";

const MAIN = SEED_STORES.main.id;
const SECOND = SEED_STORES.second.id;

describe("category and collection images", () => {
  let app: INestApplication;
  let session: Session;
  let catalog: ReturnType<typeof api>;
  let ownerSecondSession: Session;
  let colorSeed = 0;

  const pub = (path: string) =>
    request(app.getHttpServer()).get(`/api/v1/storefront${path}`).set("X-Store-Id", MAIN);

  /** Uploads a distinct small PNG (distinct, so uploads aren't deduplicated). */
  const image = async (s: Session = session, store: string = MAIN): Promise<string> => {
    colorSeed += 1;
    const buf = await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 3,
        background: { r: (colorSeed * 37) % 256, g: (colorSeed * 91) % 256, b: Date.now() % 256 },
      },
    })
      .png()
      .toBuffer();
    const res = await request(app.getHttpServer())
      .post("/api/v1/media")
      .set("Cookie", s.cookies)
      .set("X-Store-Id", store)
      .set("X-CSRF-Token", s.csrf)
      .attach("file", buf, `img-${RUN}-${colorSeed}.png`)
      .expect(201);
    return res.body.data.id as string;
  };

  const category = async (id: string) =>
    (await catalog.get("/categories").expect(200)).body.data.find(
      (c: { id: string }) => c.id === id,
    );

  const product = async (title: string, extra: Record<string, unknown>) =>
    (
      await catalog
        .post("/products", {
          title: `${title} ${RUN}`,
          price_minor: 1000,
          inventory_tracking: false,
          ...extra,
        })
        .expect(201)
    ).body.data as { id: string };

  beforeAll(async () => {
    app = await createTestApp();
    session = await login(app, "catalog@cartforge.test");
    catalog = api(app, session, MAIN);
    ownerSecondSession = await login(app, "owner@cartforge.test");
  });
  afterAll(async () => {
    await app.close();
  });

  describe("categories", () => {
    let parent: { id: string; handle: string };
    let child: { id: string };
    let productPhoto: string;

    beforeAll(async () => {
      parent = (await catalog.post("/categories", { name: `Suits ${RUN}` }).expect(201)).body.data;
      child = (
        await catalog
          .post("/categories", { name: `Velvet ${RUN}`, parent_id: parent.id })
          .expect(201)
      ).body.data;
    });

    it("has no image until a product with a photo is in it", async () => {
      const c = await category(parent.id);
      expect(c).toMatchObject({ image: null, auto_image: null });
    });

    it("uses the newest active product's photo, from subcategories too, ignoring drafts", async () => {
      productPhoto = await image();
      await product("Velvet suit", {
        status: "active",
        category_ids: [child.id],
        media: [{ media_asset_id: productPhoto }],
      });
      const draftPhoto = await image();
      await product("Draft suit", {
        category_ids: [child.id],
        media: [{ media_asset_id: draftPhoto }],
      });

      const c = await category(parent.id);
      expect(c.image).toBeNull();
      expect(c.auto_image.media_asset_id).toBe(productPhoto);

      const shop = (await pub("/categories").expect(200)).body.data;
      const tile = shop.find((x: { id: string }) => x.id === parent.id);
      expect(tile.image.url).toBe(c.auto_image.url);
      const detail = (await pub(`/categories/${parent.handle}`).expect(200)).body.data;
      expect(detail.image.url).toBe(c.auto_image.url);
    });

    it("prefers the chosen image and protects it from deletion", async () => {
      const cover = await image();
      const saved = (
        await catalog.patch(`/categories/${parent.id}`, { image_asset_id: cover }).expect(200)
      ).body.data;
      expect(saved.image.media_asset_id).toBe(cover);
      expect(saved.auto_image.media_asset_id).toBe(productPhoto);

      const tile = (await pub("/categories").expect(200)).body.data.find(
        (x: { id: string }) => x.id === parent.id,
      );
      expect(tile.image.url).toBe(saved.image.url);

      const blocked = await catalog.delete(`/media/${cover}`).expect(409);
      expect(blocked.body.error.code).toBe("MEDIA_IN_USE");

      // Removing it falls back to the product photo and frees the image.
      const cleared = (
        await catalog.patch(`/categories/${parent.id}`, { image_asset_id: null }).expect(200)
      ).body.data;
      expect(cleared.image).toBeNull();
      expect(cleared.auto_image.media_asset_id).toBe(productPhoto);
      await catalog.delete(`/media/${cover}`).expect(200);
    });

    it("rejects another store's image", async () => {
      const foreign = await image(ownerSecondSession, SECOND);
      const res = await catalog
        .post("/categories", { name: `Foreign img ${RUN}`, image_asset_id: foreign })
        .expect(422);
      expect(res.body.error.fields[0].path).toBe("image_asset_id");
    });

    it("releases the image when the category is deleted", async () => {
      const cover = await image();
      const c = (
        await catalog
          .post("/categories", { name: `Temp ${RUN}`, image_asset_id: cover })
          .expect(201)
      ).body.data;
      expect(c.image.media_asset_id).toBe(cover);
      await catalog.delete(`/media/${cover}`).expect(409);
      await catalog.delete(`/categories/${c.id}`).expect(200);
      await catalog.delete(`/media/${cover}`).expect(200);
    });
  });

  describe("collections", () => {
    it("uses the chosen image, else the first product's photo in collection order", async () => {
      const first = await image();
      const second = await image();
      const a = await product("Col A", { status: "active", media: [{ media_asset_id: first }] });
      const b = await product("Col B", { status: "active", media: [{ media_asset_id: second }] });
      const noPhoto = await product("Col C", { status: "active" });

      const auto = (
        await catalog.post("/collections", { title: `Auto ${RUN}`, status: "active" }).expect(201)
      ).body.data;
      await catalog
        .put(`/collections/${auto.id}/products`, { product_ids: [noPhoto.id, b.id, a.id] })
        .expect(200);
      const autoDetail = (await catalog.get(`/collections/${auto.id}`).expect(200)).body.data;
      expect(autoDetail.image).toBeNull();
      expect(autoDetail.auto_image.media_asset_id).toBe(second);

      const cover = await image();
      const chosen = (
        await catalog
          .post("/collections", { title: `Chosen ${RUN}`, status: "active", image_asset_id: cover })
          .expect(201)
      ).body.data;
      expect(chosen.image.media_asset_id).toBe(cover);
      await catalog.delete(`/media/${cover}`).expect(409);

      const shop = (await pub("/collections").expect(200)).body.data;
      const byId = (id: string) => shop.find((x: { id: string }) => x.id === id);
      expect(byId(auto.id).image.url).toBe(autoDetail.auto_image.url);
      expect(byId(chosen.id).image.url).toBe(chosen.image.url);
      const page = (await pub(`/collections/${chosen.handle}`).expect(200)).body.data;
      expect(page.image.url).toBe(chosen.image.url);

      // Admin list carries both too.
      const list = (await catalog.get(`/collections?q=${RUN}`).expect(200)).body.data;
      expect(list.find((x: { id: string }) => x.id === auto.id).auto_image.media_asset_id).toBe(
        second,
      );

      await catalog.delete(`/collections/${chosen.id}`).expect(200);
      await catalog.delete(`/media/${cover}`).expect(200);
    });
  });
});
