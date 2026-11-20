import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_STORES } from "@cartforge/database/seed";
import { api, createTestApp, login, RUN, type Session } from "./app";

/**
 * Platform admin product transfer: a store's products are copied into another
 * store through the normal services (images re-uploaded, options, variants,
 * stock, categories, collections), originals archived for "move", in batches.
 */
describe("platform: move products between stores", () => {
  let app: INestApplication;
  let admin: Session;
  let src: { store_id: string };
  let dst: { store_id: string };
  let s: ReturnType<typeof api>;
  let d: ReturnType<typeof api>;

  const transfer = (from: string, body: object, as: Session = admin) =>
    request(app.getHttpServer())
      .post(`/api/v1/platform/stores/${from}/transfer-products`)
      .set("Cookie", as.cookies)
      .set("X-CSRF-Token", as.csrf)
      .send(body);

  const png = (color: string) =>
    sharp({ create: { width: 24, height: 24, channels: 3, background: color } })
      .png()
      .toBuffer();
  const upload = async (storeId: string, color: string) =>
    (
      await request(app.getHttpServer())
        .post("/api/v1/media")
        .set("Cookie", admin.cookies)
        .set("X-Store-Id", storeId)
        .set("X-CSRF-Token", admin.csrf)
        .attach("file", await png(color), `${color.slice(1)}.png`)
        .field("alt_text", `swatch ${color}`)
        .expect(201)
    ).body.data as { id: string };

  beforeAll(async () => {
    app = await createTestApp();
    admin = await login(app, "platform@cartforge.test");
    const mk = (name: string, currency: string) =>
      request(app.getHttpServer())
        .post("/api/v1/stores")
        .set("Cookie", admin.cookies)
        .set("X-CSRF-Token", admin.csrf)
        .send({ store_name: `${name} ${RUN}`, currency })
        .expect(201)
        .then((r) => r.body.data);
    src = await mk("Transfer From", "EUR");
    dst = await mk("Transfer To", "USD");
    s = api(app, admin, src.store_id);
    d = api(app, admin, dst.store_id);

    const parent = (await s.post("/categories", { name: "Bags" }).expect(201)).body.data;
    const child = (await s.post("/categories", { name: "Totes", parent_id: parent.id }).expect(201))
      .body.data;
    const col = (await s.post("/collections", { title: "Summer", status: "active" }).expect(201))
      .body.data;
    const img = await upload(src.store_id, "#aa3322");
    await s
      .post("/products", {
        title: "Canvas Tote",
        status: "active",
        price_minor: 2500,
        compare_at_minor: 3000,
        sku: "TOTE-1",
        inventory_quantity: 7,
        tags: ["canvas"],
        seo_title: "Tote SEO",
        category_ids: [child.id],
        collection_ids: [col.id],
        media: [{ media_asset_id: img.id }],
      })
      .expect(201);

    const navy = await upload(src.store_id, "#112233");
    const sky = await upload(src.store_id, "#ddeeff");
    const shirt = (
      await s
        .post("/products", {
          title: "Linen Shirt",
          price_minor: 4000,
          media: [{ media_asset_id: navy.id }, { media_asset_id: sky.id }],
        })
        .expect(201)
    ).body.data;
    await s
      .put(`/products/${shirt.id}/options`, {
        options: [
          { name: "Color", values: ["Navy", "Sky"] },
          { name: "Size", values: ["S", "M"] },
        ],
      })
      .expect(200);
    const detail = (await s.get(`/products/${shirt.id}`).expect(200)).body.data;
    for (const v of detail.variants) {
      const isNavy = v.title.startsWith("Navy");
      await s
        .patch(`/variants/${v.id}`, {
          sku: `LS-${v.title.replace(/\W+/g, "")}`,
          price_minor: isNavy ? 4200 : 4000,
          media_asset_id: isNavy ? navy.id : sky.id,
        })
        .expect(200);
      await s
        .post("/inventory/adjustments", {
          variant_id: v.id,
          mode: "set",
          quantity: isNavy ? 3 : 5,
          reason: "received",
        })
        .expect(201);
    }
    await s.post(`/products/${shirt.id}/publish`).expect(200);
    // Enough products for more than one batch.
    for (const n of [1, 2, 3])
      await s.post("/products", { title: `Draft ${n}`, price_minor: 1000 * n }).expect(201);
    const gone = (await s.post("/products", { title: "Old", price_minor: 100 }).expect(201)).body
      .data;
    await s.post(`/products/${gone.id}/archive`).expect(200);
  });
  afterAll(() => app.close());

  it("is only for platform admins", async () => {
    const owner = await login(app, "owner@cartforge.test");
    await transfer(
      SEED_STORES.second.id,
      { to_store_id: SEED_STORES.main.id, price_rate: 1 },
      owner,
    ).expect(403);
  });

  it("refuses the same store, and needs a price rate across currencies", async () => {
    await transfer(src.store_id, { to_store_id: src.store_id }).expect(422);
    const res = await transfer(src.store_id, { to_store_id: dst.store_id }).expect(422);
    expect(res.body.error.code).toBe("PRICE_RATE_REQUIRED");
    // Nothing happened.
    expect((await d.get("/products").expect(200)).body.meta.total).toBe(0);
  });

  it("moves every product in batches, then has nothing left to do", async () => {
    const first = (
      await transfer(src.store_id, { to_store_id: dst.store_id, price_rate: 1.1 }).expect(200)
    ).body.data;
    expect(first.done).toHaveLength(4);
    expect(first.failed).toEqual([]);
    expect(first.remaining).toBe(1);
    const second = (
      await transfer(src.store_id, { to_store_id: dst.store_id, price_rate: 1.1 }).expect(200)
    ).body.data;
    expect(second.done).toHaveLength(1);
    expect(second.remaining).toBe(0);

    const again = (
      await transfer(src.store_id, { to_store_id: dst.store_id, price_rate: 1.1 }).expect(200)
    ).body.data;
    expect(again).toMatchObject({ done: [], failed: [], remaining: 0 });

    // Originals archived (the already archived one untouched and not copied).
    const left = (await s.get("/products?status=draft,active").expect(200)).body.meta.total;
    expect(left).toBe(0);
    const copied = (await d.get("/products?page_size=50").expect(200)).body.data as {
      title: string;
    }[];
    expect(copied.map((p) => p.title).sort()).toEqual(
      ["Canvas Tote", "Draft 1", "Draft 2", "Draft 3", "Linen Shirt"].sort(),
    );
  });

  it("copies prices, stock, images, variants, categories and collections faithfully", async () => {
    const find = async (title: string) => {
      const list = (await d.get(`/products?q=${encodeURIComponent(title)}`).expect(200)).body.data;
      return (await d.get(`/products/${list[0].id}`).expect(200)).body.data;
    };
    const tote = await find("Canvas Tote");
    expect(tote).toMatchObject({
      status: "active",
      currency: "USD",
      price_minor: 2750,
      compare_at_minor: 3300,
      tags: ["canvas"],
      seo_title: "Tote SEO",
    });
    expect(tote.categories.map((c: { path: string }) => c.path)).toEqual(["Bags › Totes"]);
    expect(tote.collections.map((c: { title: string }) => c.title)).toEqual(["Summer"]);
    expect(tote.media).toHaveLength(1);
    expect(tote.media[0].alt_text).toBe("swatch #aa3322");
    expect(tote.variants[0]).toMatchObject({ sku: "TOTE-1", inventory: { on_hand: 7 } });

    const shirt = await find("Linen Shirt");
    expect(shirt.status).toBe("active");
    expect(shirt.media).toHaveLength(2);
    const byTitle = Object.fromEntries(
      shirt.variants.map((v: { title: string }) => [v.title, v]),
    ) as Record<
      string,
      {
        sku: string;
        price_minor: number;
        media_asset_id: string;
        inventory: { on_hand: number };
      }
    >;
    expect(Object.keys(byTitle).sort()).toEqual(["Navy / M", "Navy / S", "Sky / M", "Sky / S"]);
    expect(byTitle["Navy / S"]).toMatchObject({
      sku: "LS-NavyS",
      price_minor: 4620,
      inventory: { on_hand: 3 },
    });
    expect(byTitle["Sky / M"]).toMatchObject({ price_minor: 4400, inventory: { on_hand: 5 } });
    // Variant images point at the target store's own copies.
    expect(byTitle["Navy / S"]!.media_asset_id).toBe(shirt.media[0].media_asset_id);
    expect(byTitle["Sky / S"]!.media_asset_id).toBe(shirt.media[1].media_asset_id);

    // The storefront shows them in the new store.
    const pub = await request(app.getHttpServer())
      .get("/api/v1/storefront/products?page_size=50")
      .set("X-Store-Id", dst.store_id)
      .expect(200);
    expect(pub.body.data.map((p: { title: string }) => p.title).sort()).toEqual([
      "Canvas Tote",
      "Linen Shirt",
    ]);
  });

  it("copy mode leaves the originals in place", async () => {
    const third = (
      await request(app.getHttpServer())
        .post("/api/v1/stores")
        .set("Cookie", admin.cookies)
        .set("X-CSRF-Token", admin.csrf)
        .send({ store_name: `Transfer Copy ${RUN}`, currency: "USD" })
        .expect(201)
    ).body.data;
    // Same currency: no rate needed.
    let res;
    do {
      res = (
        await transfer(dst.store_id, { to_store_id: third.store_id, mode: "copy" }).expect(200)
      ).body.data;
    } while (res.remaining > 0);
    expect((await d.get("/products?status=draft,active").expect(200)).body.meta.total).toBe(5);
    const t = api(app, admin, third.store_id);
    expect((await t.get("/products").expect(200)).body.meta.total).toBe(5);
  });
});
