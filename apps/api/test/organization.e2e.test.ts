import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { SEED_STORES } from "@cartforge/database/seed";
import { api, createTestApp, login, RUN } from "./app";
import { TEST_ENV } from "./test-env";

const MAIN = SEED_STORES.main.id;
const SECOND = SEED_STORES.second.id;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

describe("categories, collections, SEO, bulk, duplicate, storefront (Sprint 4)", () => {
  let app: INestApplication;
  let catalog: ReturnType<typeof api>;
  let admin: ReturnType<typeof api>;
  let orders: ReturnType<typeof api>;
  let ownerSecond: ReturnType<typeof api>;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  const pub = (path: string, store: string = MAIN) =>
    request(app.getHttpServer()).get(`/api/v1/storefront${path}`).set("X-Store-Id", store);

  beforeAll(async () => {
    app = await createTestApp();
    catalog = api(app, await login(app, "catalog@cartforge.test"), MAIN);
    admin = api(app, await login(app, "admin@cartforge.test"), MAIN);
    orders = api(app, await login(app, "orders@cartforge.test"), MAIN);
    ownerSecond = api(app, await login(app, "owner@cartforge.test"), SECOND);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe("categories", () => {
    let a: string, b: string, c: string;
    it("builds a tree with generated handles and paths", async () => {
      a = (await catalog.post("/categories", { name: `Apparel ${RUN}` }).expect(201)).body.data.id;
      b = (await catalog.post("/categories", { name: `Tops ${RUN}`, parent_id: a }).expect(201))
        .body.data.id;
      c = (await catalog.post("/categories", { name: `Tees ${RUN}`, parent_id: b }).expect(201))
        .body.data.id;
      const list = (await catalog.get("/categories").expect(200)).body.data;
      const tees = list.find((x: { id: string }) => x.id === c);
      expect(tees).toMatchObject({
        depth: 2,
        path: `Apparel ${RUN} › Tops ${RUN} › Tees ${RUN}`,
        handle: slug(`Tees ${RUN}`),
      });
      const idx = (id: string) => list.findIndex((x: { id: string }) => x.id === id);
      expect(idx(a)).toBeLessThan(idx(b));
      expect(idx(b)).toBeLessThan(idx(c));
    });

    it("enforces the depth limit and prevents cycles", async () => {
      const deep = await catalog
        .post("/categories", { name: "Too deep", parent_id: c })
        .expect(422);
      expect(deep.body.error.code).toBe("CATEGORY_DEPTH_EXCEEDED");
      const cycle = await catalog.patch(`/categories/${a}`, { parent_id: c }).expect(422);
      expect(cycle.body.error.code).toBe("CATEGORY_CYCLE");
      const self = await catalog.patch(`/categories/${a}`, { parent_id: a }).expect(422);
      expect(self.body.error.code).toBe("CATEGORY_CYCLE");
    });

    it("rejects duplicate handles and other stores' parents", async () => {
      const dup = await catalog
        .post("/categories", { name: "X", handle: slug(`Apparel ${RUN}`) })
        .expect(409);
      expect(dup.body.error.code).toBe("CATEGORY_HANDLE_TAKEN");
      const foreign = (
        await ownerSecond.post("/categories", { name: `Foreign ${RUN}` }).expect(201)
      ).body.data.id;
      await catalog.post("/categories", { name: "Y", parent_id: foreign }).expect(422);
    });

    it("reorders siblings", async () => {
      const top2 = (
        await catalog.post("/categories", { name: `Bottoms ${RUN}`, parent_id: a }).expect(201)
      ).body.data.id;
      await catalog.post("/categories/reorder", { parent_id: a, ids: [top2, b] }).expect(200);
      const list = (await catalog.get("/categories").expect(200)).body.data;
      const idx = (id: string) => list.findIndex((x: { id: string }) => x.id === id);
      expect(idx(top2)).toBeLessThan(idx(b));
      await catalog.post("/categories/reorder", { parent_id: a, ids: [b] }).expect(422);
    });

    it("requires a decision before deleting a category with products", async () => {
      const keep = (await catalog.post("/categories", { name: `Keep ${RUN}` }).expect(201)).body
        .data.id;
      const gone = (await catalog.post("/categories", { name: `Gone ${RUN}` }).expect(201)).body
        .data.id;
      const p = (
        await catalog
          .post("/products", { title: `In gone ${RUN}`, category_ids: [gone] })
          .expect(201)
      ).body.data.id;
      const blocked = await catalog.delete(`/categories/${gone}`).expect(409);
      expect(blocked.body.error.code).toBe("CATEGORY_HAS_PRODUCTS");
      await catalog.post(`/categories/${gone}/delete`, { reassign_to: keep }).expect(200);
      const prod = (await catalog.get(`/products/${p}`).expect(200)).body.data;
      expect(prod.categories.map((x: { id: string }) => x.id)).toEqual([keep]);
      expect((await catalog.delete(`/categories/${a}`).expect(409)).body.error.code).toBe(
        "CATEGORY_HAS_CHILDREN",
      );
    });

    it("needs categories.write", async () => {
      await orders.post("/categories", { name: "Nope" }).expect(403);
      await orders.get("/categories").expect(200);
    });
  });

  describe("products: organization + SEO", () => {
    let cat: string, sub: string, col: string, id: string;
    beforeAll(async () => {
      cat = (await catalog.post("/categories", { name: `Home ${RUN}` }).expect(201)).body.data.id;
      sub = (
        await catalog.post("/categories", { name: `Kitchen ${RUN}`, parent_id: cat }).expect(201)
      ).body.data.id;
      col = (await catalog.post("/collections", { title: `Gifts ${RUN}` }).expect(201)).body.data
        .id;
    });

    it("assigns categories, collections, normalized tags and SEO", async () => {
      const res = await catalog
        .post("/products", {
          title: `Teapot ${RUN}`,
          category_ids: [sub],
          collection_ids: [col],
          tags: ["Ceramic", " ceramic ", `Gift  ${RUN}`],
          seo_title: "Hand-made teapot",
          seo_description: "Holds 1L.",
        })
        .expect(201);
      id = res.body.data.id;
      expect(res.body.data).toMatchObject({
        categories: [{ id: sub, path: `Home ${RUN} › Kitchen ${RUN}` }],
        collections: [{ id: col }],
        tags: ["Ceramic", `Gift ${RUN}`],
        seo_title: "Hand-made teapot",
        seo_description: "Holds 1L.",
      });
    });

    it("filters the product list by category, collection and tag", async () => {
      const by = async (q: string) =>
        (await catalog.get(`/products?${q}`).expect(200)).body.data.map(
          (p: { id: string }) => p.id,
        );
      expect(await by(`category_id=${sub}`)).toEqual([id]);
      expect(await by(`collection_id=${col}`)).toEqual([id]);
      expect(await by(`tag=${encodeURIComponent(`GIFT ${RUN}`)}`)).toEqual([id]);
    });

    it("replaces organization on update and rejects foreign ids", async () => {
      const res = await catalog
        .patch(`/products/${id}`, { tags: ["Kitchen"], collection_ids: [] })
        .expect(200);
      expect(res.body.data).toMatchObject({ tags: ["Kitchen"], collections: [] });
      expect(res.body.data.categories).toHaveLength(1);
      const foreign = (await ownerSecond.post("/categories", { name: `F2 ${RUN}` }).expect(201))
        .body.data.id;
      const bad = await catalog.patch(`/products/${id}`, { category_ids: [foreign] }).expect(422);
      expect(bad.body.error.fields[0].path).toBe("category_ids.0");
    });

    it("creates a redirect when a published product's handle changes", async () => {
      const p = (
        await catalog.post("/products", { title: `Kettle ${RUN}`, price_minor: 3000 }).expect(201)
      ).body.data;
      await catalog.post(`/products/${p.id}/publish`).expect(200);
      await catalog
        .patch(`/products/${p.id}`, { handle: `kettle-new-${RUN}`, confirm_handle_change: true })
        .expect(200);
      const old = await pub(`/products/${p.handle}`).expect(301);
      expect(old.headers.location).toBe(`/api/v1/storefront/products/kettle-new-${RUN}`);
      await pub(`/products/kettle-new-${RUN}`).expect(200);
      // Second rename keeps the chain flat: the original handle points at the newest one.
      await catalog
        .patch(`/products/${p.id}`, { handle: `kettle-v3-${RUN}`, confirm_handle_change: true })
        .expect(200);
      expect((await pub(`/products/${p.handle}`).expect(301)).headers.location).toContain(
        `kettle-v3-${RUN}`,
      );
    });

    it("writes outbox events in the same transaction", async () => {
      const before = await prisma.outboxEvent.count({ where: { resource_id: id } });
      await catalog.patch(`/products/${id}`, { title: `Teapot v2 ${RUN}` }).expect(200);
      const events = await prisma.outboxEvent.findMany({
        where: { resource_id: id },
        orderBy: { created_at: "desc" },
      });
      expect(events.length).toBe(before + 1);
      expect(events[0]).toMatchObject({
        event_type: "product.updated",
        store_id: MAIN,
        processed_at: null,
      });
    });
  });

  describe("collections", () => {
    it("orders products manually and handles live handle changes", async () => {
      const ids: string[] = [];
      for (const t of ["One", "Two", "Three"])
        ids.push(
          (await catalog.post("/products", { title: `${t} ${RUN}`, price_minor: 1000 }).expect(201))
            .body.data.id,
        );
      const col = (
        await catalog.post("/collections", { title: `Summer ${RUN}`, status: "active" }).expect(201)
      ).body.data;
      const set = await catalog
        .put(`/collections/${col.id}/products`, { product_ids: [ids[2], ids[0], ids[1]] })
        .expect(200);
      expect(set.body.data.products.map((p: { id: string }) => p.id)).toEqual([
        ids[2],
        ids[0],
        ids[1],
      ]);
      expect(set.body.data.product_count).toBe(3);

      const blocked = await catalog
        .patch(`/collections/${col.id}`, { handle: `summer-sale-${RUN}` })
        .expect(409);
      expect(blocked.body.error.code).toBe("HANDLE_CHANGE_REQUIRES_CONFIRMATION");
      await catalog
        .patch(`/collections/${col.id}`, {
          handle: `summer-sale-${RUN}`,
          confirm_handle_change: true,
        })
        .expect(200);
      await pub(`/collections/${col.handle}`).expect(301);

      const foreign = (await ownerSecond.post("/products", { title: "Foreign" }).expect(201)).body
        .data.id;
      await catalog.put(`/collections/${col.id}/products`, { product_ids: [foreign] }).expect(422);
      await catalog.delete(`/collections/${col.id}`).expect(200);
      await catalog.get(`/collections/${col.id}`).expect(404);
    });
  });

  describe("bulk actions", () => {
    it("publishes what it can and reports what it can't", async () => {
      const ok1 = (
        await catalog.post("/products", { title: `Bulk A ${RUN}`, price_minor: 500 }).expect(201)
      ).body.data.id;
      const ok2 = (
        await catalog.post("/products", { title: `Bulk B ${RUN}`, price_minor: 600 }).expect(201)
      ).body.data.id;
      const bad = (await catalog.post("/products", { title: `Bulk C ${RUN}` }).expect(201)).body
        .data.id;
      const res = await catalog
        .post("/products/bulk", { action: "publish", product_ids: [ok1, ok2, bad] })
        .expect(200);
      expect(res.body.data.succeeded.sort()).toEqual([ok1, ok2].sort());
      expect(res.body.data.failed).toEqual([
        expect.objectContaining({
          id: bad,
          title: `Bulk C ${RUN}`,
          errors: [expect.objectContaining({ path: "price_minor" })],
        }),
      ]);
      const tags = await catalog
        .post("/products/bulk", { action: "add_tags", product_ids: [ok1, ok2], tags: ["Sale"] })
        .expect(200);
      expect(tags.body.data.succeeded).toHaveLength(2);
      expect((await catalog.get(`/products/${ok1}`).expect(200)).body.data.tags).toContain("Sale");
      await catalog
        .post("/products/bulk", { action: "remove_tags", product_ids: [ok1], tags: ["sale"] })
        .expect(200);
      expect((await catalog.get(`/products/${ok1}`).expect(200)).body.data.tags).not.toContain(
        "Sale",
      );
      const del = await catalog
        .post("/products/bulk", { action: "delete", product_ids: [bad] })
        .expect(200);
      expect(del.body.data.succeeded).toEqual([bad]);
    });

    it("checks per-action permissions", async () => {
      const p = (await catalog.post("/products", { title: `Perm ${RUN}` }).expect(201)).body.data
        .id;
      await orders
        .post("/products/bulk", { action: "add_tags", product_ids: [p], tags: ["x"] })
        .expect(403);
    });
  });

  describe("duplicate", () => {
    it("copies a variable product as a draft without SKUs or stock", async () => {
      const src = (
        await admin
          .post("/products", {
            title: `Original ${RUN}`,
            price_minor: 2500,
            sku: `ORIG-${RUN}`,
            inventory_quantity: 9,
            tags: ["Wool"],
          })
          .expect(201)
      ).body.data;
      await admin
        .put(`/products/${src.id}/options`, { options: [{ name: "Size", values: ["S", "M"] }] })
        .expect(200);
      await admin.patch(`/products/${src.id}`, { status: "active" }).expect(200);
      const copy = (await catalog.post(`/products/${src.id}/duplicate`, {}).expect(201)).body.data;
      expect(copy).toMatchObject({
        title: `Copy of Original ${RUN}`,
        status: "draft",
        product_type: "variable",
        tags: ["Wool"],
      });
      expect(copy.handle).not.toBe(src.handle);
      expect(copy.options).toEqual([expect.objectContaining({ name: "Size" })]);
      expect(
        copy.variants.map(
          (v: {
            title: string;
            sku: string | null;
            price_minor: number;
            inventory: { on_hand: number };
          }) => [v.title, v.sku, v.price_minor, v.inventory.on_hand],
        ),
      ).toEqual([
        ["S", null, 2500, 0],
        ["M", null, 2500, 0],
      ]);
    });
  });

  describe("public storefront API", () => {
    let col: { id: string; handle: string };
    let activeA: { id: string; handle: string };
    beforeAll(async () => {
      col = (
        await catalog.post("/collections", { title: `Front ${RUN}`, status: "active" }).expect(201)
      ).body.data;
      activeA = (
        await catalog
          .post("/products", {
            title: `Visible ${RUN}`,
            price_minor: 1999,
            compare_at_minor: 2999,
            cost_minor: 700,
            status: "active",
          })
          .expect(201)
      ).body.data;
      const draft = (
        await catalog
          .post("/products", { title: `Hidden draft ${RUN}`, price_minor: 100 })
          .expect(201)
      ).body.data;
      const archived = (
        await catalog
          .post("/products", {
            title: `Hidden archived ${RUN}`,
            price_minor: 100,
            status: "active",
          })
          .expect(201)
      ).body.data;
      await catalog.post(`/products/${archived.id}/archive`).expect(200);
      await catalog
        .put(`/collections/${col.id}/products`, {
          product_ids: [archived.id, draft.id, activeA.id],
        })
        .expect(200);
    });

    it("lists only active products and never internal fields", async () => {
      const res = await pub(`/products?q=${encodeURIComponent(RUN)}&page_size=50`).expect(200);
      const titles = res.body.data.map((p: { title: string }) => p.title);
      expect(titles).toContain(`Visible ${RUN}`);
      expect(titles.some((t: string) => t.startsWith("Hidden"))).toBe(false);
      const body = JSON.stringify(res.body);
      for (const secret of ["cost_minor", "on_hand", "reserved", "created_by", "store_id", "sku"])
        expect(body).not.toContain(secret);
      expect(res.headers["cache-control"]).toContain("s-maxage");
    });

    it("filters by collection (in manual order) and serves product detail", async () => {
      const inCol = (await pub(`/products?collection=${col.handle}`).expect(200)).body.data;
      expect(inCol.map((p: { id: string }) => p.id)).toEqual([activeA.id]);
      const detail = (await pub(`/products/${activeA.handle}`).expect(200)).body.data;
      expect(detail).toMatchObject({
        price_min_minor: 1999,
        compare_at_min_minor: 2999,
        available: false,
        currency: "USD",
      });
      expect(detail.variants[0]).toEqual(
        expect.objectContaining({ available: false, price_minor: 1999 }),
      );
    });

    it("includes subcategories when filtering by category", async () => {
      const parent = (await catalog.post("/categories", { name: `Outdoor ${RUN}` }).expect(201))
        .body.data;
      const child = (
        await catalog
          .post("/categories", { name: `Tents ${RUN}`, parent_id: parent.id })
          .expect(201)
      ).body.data;
      const tent = (
        await catalog
          .post("/products", {
            title: `Tent ${RUN}`,
            price_minor: 9900,
            status: "active",
            category_ids: [child.id],
            inventory_tracking: false,
          })
          .expect(201)
      ).body.data;
      const res = (await pub(`/products?category=${parent.handle}`).expect(200)).body.data;
      expect(res.map((p: { id: string }) => p.id)).toEqual([tent.id]);
      expect(res[0].available).toBe(true); // untracked ⇒ available
    });

    it("hides drafts by handle and unknown stores", async () => {
      const draft = (
        await catalog.post("/products", { title: `Secret ${RUN}`, price_minor: 100 }).expect(201)
      ).body.data;
      await pub(`/products/${draft.handle}`).expect(404);
      await pub("/products", "00000000-0000-4000-8000-0000000000ff").expect(404);
      await request(app.getHttpServer()).get("/api/v1/storefront/products").expect(404);
    });
  });
});
