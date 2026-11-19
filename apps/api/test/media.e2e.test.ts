import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { SEED_STORES } from "@cartforge/database/seed";
import { api, createTestApp, login, RUN, type Session } from "./app";
import { makeImage, uniqueImage } from "./fixtures";
import { TEST_ENV } from "./test-env";

const MAIN = SEED_STORES.main.id;
const SECOND = SEED_STORES.second.id;

describe("media + pricing (Sprint 2)", () => {
  let app: INestApplication;
  let catalogSession: Session;
  let catalog: ReturnType<typeof api>;
  let orders: ReturnType<typeof api>;
  let ownerSecond: ReturnType<typeof api>;
  let ownerSecondSession: Session;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);

  const upload = (s: Session, storeId: string, buf: Buffer, name = "photo.png", alt?: string) => {
    let r = request(app.getHttpServer())
      .post("/api/v1/media")
      .set("Cookie", s.cookies)
      .set("X-Store-Id", storeId)
      .set("X-CSRF-Token", s.csrf)
      .attach("file", buf, name);
    if (alt) r = r.field("alt_text", alt);
    return r;
  };

  beforeAll(async () => {
    app = await createTestApp();
    catalogSession = await login(app, "catalog@cartforge.test");
    catalog = api(app, catalogSession, MAIN);
    orders = api(app, await login(app, "orders@cartforge.test"), MAIN);
    ownerSecondSession = await login(app, "owner@cartforge.test");
    ownerSecond = api(app, ownerSecondSession, SECOND);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe("upload", () => {
    it("stores the image with derivatives and serves it", async () => {
      const res = await upload(
        catalogSession,
        MAIN,
        await uniqueImage(),
        "red-shirt.png",
        "Red shirt",
      ).expect(201);
      const a = res.body.data;
      expect(a).toMatchObject({
        mime_type: "image/png",
        original_filename: "red-shirt.png",
        alt_text: "Red shirt",
        reference_count: 0,
      });
      expect(a.thumb_url).toMatch(/\/api\/v1\/media\/files\/stores\/.+\/thumb\.webp$/);
      expect(a.medium_url && a.large_url).toBeTruthy();

      const file = await request(app.getHttpServer()).get(a.thumb_url).expect(200);
      expect(file.headers["content-type"]).toBe("image/webp");
      expect(file.headers["cache-control"]).toContain("immutable");
      const meta = await sharp(file.body as Buffer).metadata();
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(160);
    });

    it("de-duplicates identical files within a store, not across stores", async () => {
      const buf = await uniqueImage();
      const first = await upload(catalogSession, MAIN, buf).expect(201);
      const again = await upload(catalogSession, MAIN, buf, "renamed.png").expect(201);
      expect(again.body.data.id).toBe(first.body.data.id);
      expect(again.body.data.deduplicated).toBe(true);
      const other = await upload(ownerSecondSession, SECOND, buf).expect(201);
      expect(other.body.data.id).not.toBe(first.body.data.id);
    });

    it("rejects non-images regardless of extension or declared type", async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      const res = await upload(catalogSession, MAIN, svg, "logo.png").expect(422);
      expect(res.body.error.code).toBe("MEDIA_INVALID_FILE");
      expect(res.body.error.fields[0].path).toBe("file");
      await upload(catalogSession, MAIN, Buffer.from("plain text"), "notes.jpg").expect(422);
    });

    it("rejects files over the size limit with 413", async () => {
      const noise = await sharp(
        Buffer.from(Array.from({ length: 900 * 900 * 3 }, (_, i) => (i * 2654435761) % 256)),
        {
          raw: { width: 900, height: 900, channels: 3 },
        },
      )
        .png({ compressionLevel: 0 })
        .toBuffer();
      expect(noise.length).toBeGreaterThan(1024 * 1024);
      const res = await upload(catalogSession, MAIN, noise, "big.png").expect(413);
      expect(res.body.error.code).toBe("MEDIA_TOO_LARGE");
    });

    it("requires a file and the media.write permission", async () => {
      const noFile = await request(app.getHttpServer())
        .post("/api/v1/media")
        .set("Cookie", catalogSession.cookies)
        .set("X-Store-Id", MAIN)
        .set("X-CSRF-Token", catalogSession.csrf)
        .field("alt_text", "x")
        .expect(422);
      expect(noFile.body.error.fields[0].path).toBe("file");
      await orders.get("/media").expect(403);
    });

    it("blocks path traversal on the file route", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/media/files/..%2F..%2Fetc%2Fpasswd")
        .expect(404);
      await request(app.getHttpServer())
        .get("/api/v1/media/files/stores/../../package.json")
        .expect(404);
    });
  });

  describe("product images and pricing", () => {
    let imgA: string;
    let imgB: string;
    let imgC: string;
    beforeAll(async () => {
      imgA = (await upload(catalogSession, MAIN, await uniqueImage(), "a.png").expect(201)).body
        .data.id;
      imgB = (await upload(catalogSession, MAIN, await uniqueImage("jpeg"), "b.jpg").expect(201))
        .body.data.id;
      imgC = (await upload(catalogSession, MAIN, await uniqueImage("webp"), "c.webp").expect(201))
        .body.data.id;
    });

    it("creates a priced product with ordered images and a chosen primary", async () => {
      const res = await catalog
        .post("/products", {
          title: `Priced Tee ${RUN}`,
          price_minor: 2500,
          compare_at_minor: 3000,
          cost_minor: 900,
          media: [
            { media_asset_id: imgA },
            { media_asset_id: imgB, alt_text: "Back view" },
            { media_asset_id: imgC },
          ],
          primary_media_id: imgB,
        })
        .expect(201);
      const p = res.body.data;
      expect(p).toMatchObject({
        price_minor: 2500,
        compare_at_minor: 3000,
        cost_minor: 900,
        currency: "USD",
        taxable: true,
      });
      expect(p.media.map((m: { media_asset_id: string }) => m.media_asset_id)).toEqual([
        imgA,
        imgB,
        imgC,
      ]);
      expect(p.media.find((m: { is_primary: boolean }) => m.is_primary).media_asset_id).toBe(imgB);
      expect(p.media[1].alt_text).toBe("Back view");

      const list = await catalog
        .get(`/products?q=${encodeURIComponent(`Priced Tee ${RUN}`)}`)
        .expect(200);
      expect(list.body.data[0]).toMatchObject({ price_minor: 2500, currency: "USD" });
      expect(list.body.data[0].thumbnail_url).toContain("thumb.webp");
      expect(list.body.data[0]).not.toHaveProperty("cost_minor");
    });

    it("reorders images, changes primary and keeps omitted fields", async () => {
      const { body } = await catalog
        .post("/products", {
          title: `Reorder ${RUN}`,
          price_minor: 1000,
          media: [{ media_asset_id: imgA }, { media_asset_id: imgB }],
        })
        .expect(201);
      expect(body.data.media[0].is_primary).toBe(true);
      const res = await catalog
        .patch(`/products/${body.data.id}`, {
          media: [{ media_asset_id: imgB }, { media_asset_id: imgA }],
          primary_media_id: imgA,
        })
        .expect(200);
      expect(res.body.data.media.map((m: { media_asset_id: string }) => m.media_asset_id)).toEqual([
        imgB,
        imgA,
      ]);
      expect(res.body.data.media[1].is_primary).toBe(true);
      expect(res.body.data.price_minor).toBe(1000);
    });

    it("keeps the primary when still present, else falls back to the first image", async () => {
      const { body } = await catalog
        .post("/products", {
          title: `Primary fallback ${RUN}`,
          media: [{ media_asset_id: imgA }, { media_asset_id: imgB }],
          primary_media_id: imgB,
        })
        .expect(201);
      const kept = await catalog
        .patch(`/products/${body.data.id}`, {
          media: [{ media_asset_id: imgC }, { media_asset_id: imgB }],
        })
        .expect(200);
      expect(
        kept.body.data.media.find((m: { is_primary: boolean }) => m.is_primary).media_asset_id,
      ).toBe(imgB);
      const fallback = await catalog
        .patch(`/products/${body.data.id}`, { media: [{ media_asset_id: imgC }] })
        .expect(200);
      expect(fallback.body.data.media[0]).toMatchObject({ media_asset_id: imgC, is_primary: true });
    });

    it("validates prices against stored values", async () => {
      const { body } = await catalog
        .post("/products", { title: `Prices ${RUN}`, price_minor: 2000 })
        .expect(201);
      const id = body.data.id;
      const r1 = await catalog.patch(`/products/${id}`, { compare_at_minor: 1500 }).expect(422);
      expect(r1.body.error.fields[0].path).toBe("compare_at_minor");
      await catalog.patch(`/products/${id}`, { price_minor: -5 }).expect(422);
      await catalog.patch(`/products/${id}`, { price_minor: 19.99 }).expect(422);
      const ok = await catalog
        .patch(`/products/${id}`, { compare_at_minor: 2600, cost_minor: null })
        .expect(200);
      expect(ok.body.data).toMatchObject({
        price_minor: 2000,
        compare_at_minor: 2600,
        cost_minor: null,
      });
      const cleared = await catalog
        .patch(`/products/${id}`, { price_minor: null, compare_at_minor: null })
        .expect(200);
      expect(cleared.body.data.price_minor).toBeNull();
    });

    it("rejects product-level pricing on variable products", async () => {
      const res = await catalog
        .post("/products", { title: `Var ${RUN}`, product_type: "variable", price_minor: 100 })
        .expect(422);
      expect(res.body.error.code).toBe("PRICING_REQUIRES_VARIANTS");
    });

    it("records price changes in the audit log", async () => {
      const { body } = await catalog
        .post("/products", { title: `Audit Price ${RUN}`, price_minor: 1000 })
        .expect(201);
      await catalog.patch(`/products/${body.data.id}`, { price_minor: 1200 }).expect(200);
      const log = await prisma.auditLog.findFirst({
        where: { resource_id: body.data.id, action: "product.updated" },
        orderBy: { created_at: "desc" },
      });
      expect(log?.metadata).toMatchObject({
        before: { price_minor: 1000 },
        after: { price_minor: 1200 },
      });
    });

    it("refuses images from another store", async () => {
      const foreign = (await upload(ownerSecondSession, SECOND, await uniqueImage()).expect(201))
        .body.data.id;
      const res = await catalog
        .post("/products", { title: `Foreign ${RUN}`, media: [{ media_asset_id: foreign }] })
        .expect(422);
      expect(res.body.error.code).toBe("MEDIA_NOT_FOUND");
      expect(res.body.error.fields[0].path).toBe("media.0.media_asset_id");
      // And can't even see it.
      await catalog.delete(`/media/${foreign}`).expect(404);
      void ownerSecond;
    });

    it("rejects a primary image that isn't in the list", async () => {
      await catalog
        .post("/products", {
          title: `Bad primary ${RUN}`,
          media: [{ media_asset_id: imgA }],
          primary_media_id: imgC,
        })
        .expect(422);
    });
  });

  describe("safe deletion (§8.8 rule 9, §29.2 #30)", () => {
    it("blocks deleting referenced media; allows it once unreferenced", async () => {
      const img = (await upload(catalogSession, MAIN, await uniqueImage()).expect(201)).body.data
        .id;
      const { body } = await catalog
        .post("/products", { title: `Uses image ${RUN}`, media: [{ media_asset_id: img }] })
        .expect(201);

      const blocked = await catalog.delete(`/media/${img}`).expect(409);
      expect(blocked.body.error.code).toBe("MEDIA_IN_USE");
      const listed = await catalog.get(`/media?q=`).expect(200);
      expect(listed.body.data.find((m: { id: string }) => m.id === img).reference_count).toBe(1);

      await catalog.patch(`/products/${body.data.id}`, { media: [] }).expect(200);
      await catalog.delete(`/media/${img}`).expect(200);
      const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: img } });
      expect(row.deleted_at).not.toBeNull();
    });

    it("releases references when a product is deleted", async () => {
      const img = (await upload(catalogSession, MAIN, await uniqueImage()).expect(201)).body.data
        .id;
      const { body } = await catalog
        .post("/products", { title: `Deleted owner ${RUN}`, media: [{ media_asset_id: img }] })
        .expect(201);
      await catalog.delete(`/products/${body.data.id}`).expect(200);
      await catalog.delete(`/media/${img}`).expect(200);
    });

    it("updates alt text", async () => {
      const img = (
        await upload(
          catalogSession,
          MAIN,
          await makeImage({ w: 64, h: 64, color: "#123456" }),
        ).expect(201)
      ).body.data.id;
      const res = await catalog.patch(`/media/${img}`, { alt_text: "  Navy swatch " }).expect(200);
      expect(res.body.data.alt_text).toBe("Navy swatch");
    });
  });
});
