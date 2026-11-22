import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { api, createTestApp, login, RUN } from "./app";
import { TEST_ENV } from "./test-env";

/**
 * Sales: 20% off everything written to the variants, old prices kept and put
 * back when the sale ends (by hand or on its end date); edits during the sale win.
 */
describe("sales", () => {
  let app: INestApplication;
  let edition: string | undefined;
  let owner: ReturnType<typeof api>;
  let storeId = "";
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  let suit: { id: string; variant: string; handle: string };
  let dupatta: { id: string; variant: string; handle: string };
  let accessories = "";

  const http = () => request(app.getHttpServer());
  const prices = async (variant: string) => {
    const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant } });
    return [Number(v.price_minor), v.compare_at_minor === null ? null : Number(v.compare_at_minor)];
  };
  const mk = async (title: string, price: number) => {
    const p = (
      await owner
        .post("/products", {
          title: `${title} ${RUN}`,
          price_minor: price,
          status: "active",
          inventory_quantity: 10,
        })
        .expect(201)
    ).body.data;
    return { id: p.id as string, variant: p.variants[0].id as string, handle: p.handle as string };
  };

  beforeAll(async () => {
    edition = process.env.CARTFORGE_EDITION;
    process.env.CARTFORGE_EDITION = "saas";
    app = await createTestApp();
    const merchant = await login(app, "other@cartforge.test");
    storeId = (
      await http()
        .post("/api/v1/stores")
        .set("Cookie", merchant.cookies)
        .set("X-CSRF-Token", merchant.csrf)
        .send({ store_name: `Sale Store ${RUN}`, currency: "PKR" })
        .expect(201)
    ).body.data.store_id;
    owner = api(app, merchant, storeId);
    suit = await mk("Lawn Suit", 4000);
    dupatta = await mk("Chiffon Dupatta", 1000);
    // The dupatta is already on sale: 1,500 → 1,000.
    await prisma.productVariant.update({
      where: { id: dupatta.variant },
      data: { compare_at_minor: 1500n },
    });
    accessories = (
      await owner
        .post("/collections", { title: `Accessories ${RUN}`, status: "active" })
        .expect(201)
    ).body.data.id;
    await prisma.collectionProduct.create({
      data: { collection_id: accessories, product_id: dupatta.id, store_id: storeId, position: 0 },
    });
  });

  afterAll(async () => {
    if (edition === undefined) delete process.env.CARTFORGE_EDITION;
    else process.env.CARTFORGE_EDITION = edition;
    await prisma.$disconnect();
    await app.close();
  });

  const ALL = { all: true, product_ids: [], collection_ids: [] };

  it("validates sales", async () => {
    const bad = await owner
      .post("/sales", {
        title: "",
        value: 10_000,
        target: { all: false, product_ids: [], collection_ids: [] },
        ends_at: "2020-01-01T00:00:00Z",
      })
      .expect(422);
    expect(bad.body.error.fields.map((f: { path: string }) => f.path)).toEqual(
      expect.arrayContaining(["title", "value", "target", "ends_at"]),
    );
  });

  it("previews before anything changes, and asks about discounted products", async () => {
    const skip = (
      await owner.post("/sales/preview", { title: "Eid", value: 2000, target: ALL }).expect(200)
    ).body.data;
    expect(skip).toMatchObject({
      matched: 2,
      changing: 1,
      already_discounted: 1,
      skipped: [{ reason: "already_discounted", count: 1 }],
    });
    expect(skip.samples[0]).toMatchObject({ price_minor: 4000, sale_price_minor: 3200 });
    const stack = (
      await owner
        .post("/sales/preview", { title: "Eid", value: 2000, target: ALL, existing: "current" })
        .expect(200)
    ).body.data;
    expect(stack.changing).toBe(2);
    expect(await prices(suit.variant)).toEqual([4000, null]); // preview changes nothing
  });

  let eid = "";
  it("runs now: prices change, old ones struck through, shown on the storefront", async () => {
    const s = (
      await owner
        .post("/sales", {
          title: "Eid Sale",
          value: 2000,
          target: ALL,
          existing: "current",
          rounding: "x9",
        })
        .expect(201)
    ).body.data;
    eid = s.id;
    expect(s).toMatchObject({
      status: "running",
      summary: "20% off all products",
      product_count: 2,
      variant_count: 2,
    });
    expect(await prices(suit.variant)).toEqual([3199, 4000]);
    expect(await prices(dupatta.variant)).toEqual([799, 1500]);
    const sf = (
      await http()
        .get(`/api/v1/storefront/products/${suit.handle}`)
        .set("X-Store-Id", storeId)
        .expect(200)
    ).body.data;
    expect(sf).toMatchObject({ price_min_minor: 3199, compare_at_min_minor: 4000 });
    const info = (await owner.get(`/sales/product/${suit.id}`).expect(200)).body.data;
    expect(info).toMatchObject({ id: eid, title: "Eid Sale", status: "running" });
  });

  it("a product is in one sale at a time", async () => {
    const pv = (
      await owner
        .post("/sales/preview", {
          title: "Flash",
          value: 1000,
          target: { all: false, product_ids: [], collection_ids: [accessories] },
        })
        .expect(200)
    ).body.data;
    expect(pv).toMatchObject({ changing: 0, skipped: [{ reason: "in_other_sale", count: 1 }] });
    const none = await owner
      .post("/sales", {
        title: "Flash",
        value: 1000,
        target: { all: false, product_ids: [], collection_ids: [accessories] },
      })
      .expect(422);
    expect(none.body.error.code).toBe("SALE_NO_PRODUCTS");
    expect((await owner.get("/sales").expect(200)).body.data).toHaveLength(1); // rolled back
  });

  it("can't be deleted while running; a running sale only changes name and end date", async () => {
    await owner.delete(`/sales/${eid}`).expect(409);
    await owner.patch(`/sales/${eid}`, { value: 5000 }).expect(422);
    const later = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const s = (await owner.patch(`/sales/${eid}`, { ends_at: later }).expect(200)).body.data;
    expect(s.ends_at).toBe(later);
  });

  it("adds products created after the start, and takes products out", async () => {
    const shawl = await mk("Wool Shawl", 3000);
    expect((await owner.post(`/sales/${eid}/apply-new`).expect(200)).body.data.added).toBe(1);
    expect(await prices(shawl.variant)).toEqual([2399, 3000]);
    const out = (
      await owner.post(`/sales/${eid}/remove-products`, { product_ids: [shawl.id] }).expect(200)
    ).body.data;
    expect(out).toEqual({ restored: 1, kept: [] });
    expect(await prices(shawl.variant)).toEqual([3000, null]);
  });

  it("ending puts prices back, except ones edited during the sale", async () => {
    // The merchant changes the suit's price by hand mid-sale.
    await prisma.productVariant.update({
      where: { id: suit.variant },
      data: { price_minor: 3500n },
    });
    const r = (await owner.post(`/sales/${eid}/end`).expect(200)).body.data;
    expect(r.restored).toBe(1);
    expect(r.kept).toEqual([expect.objectContaining({ product_title: `Lawn Suit ${RUN}` })]);
    expect(await prices(dupatta.variant)).toEqual([1000, 1500]);
    expect(await prices(suit.variant)).toEqual([3500, 4000]);
    const d = (await owner.get(`/sales/${eid}`).expect(200)).body.data;
    expect(d).toMatchObject({ status: "ended", restored_count: 2, kept_count: 1 });
    await owner.post(`/sales/${eid}/end`).expect(409);
    // Tidy the suit for the next test.
    await prisma.productVariant.update({
      where: { id: suit.variant },
      data: { price_minor: 4000n, compare_at_minor: null },
    });
  });

  it("scheduled sales start and end on their dates", async () => {
    const start = new Date(Date.now() + 3_600_000).toISOString();
    const s = (
      await owner
        .post("/sales", {
          title: "Weekend",
          value_type: "fixed",
          value: 500,
          target: { all: false, product_ids: [suit.id], collection_ids: [] },
          starts_at: start,
          ends_at: new Date(Date.now() + 7_200_000).toISOString(),
        })
        .expect(201)
    ).body.data;
    expect(s).toMatchObject({
      status: "scheduled",
      summary: expect.stringMatching(/500 off 1 product$/),
    });
    expect(await prices(suit.variant)).toEqual([4000, null]);
    expect((await owner.get(`/sales/product/${suit.id}`).expect(200)).body.data.status).toBe(
      "scheduled",
    );

    // Time passes: the start is due.
    await prisma.sale.update({
      where: { id: s.id },
      data: { starts_at: new Date(Date.now() - 1000) },
    });
    const listed = (await owner.get("/sales").expect(200)).body.data;
    expect(listed.find((x: { id: string }) => x.id === s.id).status).toBe("running");
    expect(await prices(suit.variant)).toEqual([3500, 4000]);

    // …and the end.
    await prisma.sale.update({ where: { id: s.id }, data: { ends_at: new Date(Date.now() - 1) } });
    const ended = (await owner.get(`/sales/${s.id}`).expect(200)).body.data;
    expect(ended.status).toBe("ended");
    expect(await prices(suit.variant)).toEqual([4000, null]);
    await owner.delete(`/sales/${s.id}`).expect(204);
  });

  it("a scheduled sale can be cancelled", async () => {
    const s = (
      await owner
        .post("/sales", {
          title: "Later",
          value: 1000,
          target: ALL,
          starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(201)
    ).body.data;
    expect((await owner.post(`/sales/${s.id}/end`).expect(200)).body.data.restored).toBe(0);
    expect((await owner.get(`/sales/${s.id}`).expect(200)).body.data.status).toBe("canceled");
  });

  it("the cron endpoint is hidden without the secret", async () => {
    await http().get("/api/v1/internal/cron/sales").expect(404);
  });
});
