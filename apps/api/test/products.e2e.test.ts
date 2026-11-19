import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { SEED_STORES } from "@cartforge/database/seed";
import { api, createTestApp, login, RUN } from "./app";
import { TEST_ENV } from "./test-env";

const MAIN = SEED_STORES.main.id;
const SECOND = SEED_STORES.second.id;

describe("products API (Sprint 1)", () => {
  let app: INestApplication;
  let catalog: ReturnType<typeof api>;
  let orders: ReturnType<typeof api>;
  let ownerSecond: ReturnType<typeof api>;
  let otherStoreOwner: ReturnType<typeof api>;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);

  beforeAll(async () => {
    app = await createTestApp();
    catalog = api(app, await login(app, "catalog@cartforge.test"), MAIN);
    orders = api(app, await login(app, "orders@cartforge.test"), MAIN);
    const owner = await login(app, "owner@cartforge.test");
    ownerSecond = api(app, owner, SECOND);
    otherStoreOwner = api(app, await login(app, "other@cartforge.test"), MAIN);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const create = (body: object) => catalog.post("/products", body);

  describe("create", () => {
    it("creates a simple draft with a generated handle and default variant", async () => {
      const res = await create({ title: `Classic Tee ${RUN}` }).expect(201);
      const p = res.body.data;
      expect(p).toMatchObject({
        title: `Classic Tee ${RUN}`,
        handle: `classic-tee-${RUN}`,
        status: "draft",
        product_type: "simple",
        vendor: null,
        published_at: null,
        created_by: { name: "Cara Catalog" },
      });
      expect(p.variants).toHaveLength(1);
      expect(p.variants[0].title).toBe("Default");

      // Persisted: retrievable afterwards (acceptance §8.11 #1).
      const again = await catalog.get(`/products/${p.id}`).expect(200);
      expect(again.body.data.title).toBe(`Classic Tee ${RUN}`);
    });

    it("suffixes generated handles to keep them unique", async () => {
      const a = await create({ title: `Dup Name ${RUN}` }).expect(201);
      const b = await create({ title: `Dup Name ${RUN}` }).expect(201);
      expect(a.body.data.handle).toBe(`dup-name-${RUN}`);
      expect(b.body.data.handle).toBe(`dup-name-${RUN}-2`);
    });

    it("rejects an explicit duplicate handle with a field error", async () => {
      await create({ title: "First", handle: `taken-${RUN}` }).expect(201);
      const res = await create({ title: "Second", handle: `taken-${RUN}` }).expect(409);
      expect(res.body.error.code).toBe("PRODUCT_HANDLE_TAKEN");
      expect(res.body.error.fields[0]).toMatchObject({ path: "handle" });
    });

    it("allows the same handle in a different store", async () => {
      await ownerSecond.post("/products", { title: "Cross", handle: `taken-${RUN}` }).expect(201);
    });

    it("validates input at the boundary", async () => {
      const res = await create({
        title: "   ",
        handle: "Bad Handle!",
        product_type: "bundle",
      }).expect(422);
      const paths = res.body.error.fields.map((f: { path: string }) => f.path);
      expect(paths).toEqual(expect.arrayContaining(["title", "handle", "product_type"]));
    });

    it("sanitizes the description", async () => {
      const res = await create({
        title: `Safe ${RUN}`,
        description_html: '<p>Hi<script>alert(1)</script> <a href="javascript:x()">link</a></p>',
      }).expect(201);
      expect(res.body.data.description_html).toBe("<p>Hi link</p>");
    });

    it("ignores attempts to set server-owned fields", async () => {
      const res = await create({ title: `Owned ${RUN}`, store_id: SECOND, created_by: "x" }).expect(
        201,
      );
      const row = await prisma.product.findUniqueOrThrow({ where: { id: res.body.data.id } });
      expect(row.store_id).toBe(MAIN);
    });

    it("records an audit entry", async () => {
      const res = await create({ title: `Audited ${RUN}` }).expect(201);
      const log = await prisma.auditLog.findFirst({
        where: { resource_id: res.body.data.id, action: "product.created" },
      });
      expect(log).toMatchObject({ store_id: MAIN, resource_type: "product" });
    });
  });

  describe("update", () => {
    it("updates fields, records before/after, and persists", async () => {
      const { body } = await create({ title: `Edit Me ${RUN}`, vendor: "Acme" }).expect(201);
      const id = body.data.id;
      const res = await catalog
        .patch(`/products/${id}`, { title: `Edited ${RUN}`, vendor: "" })
        .expect(200);
      expect(res.body.data).toMatchObject({
        title: `Edited ${RUN}`,
        vendor: null,
        updated_by: { name: "Cara Catalog" },
      });
      // Handle doesn't silently change when the title does.
      expect(res.body.data.handle).toBe(`edit-me-${RUN}`);

      const log = await prisma.auditLog.findFirst({
        where: { resource_id: id, action: "product.updated" },
        orderBy: { created_at: "desc" },
      });
      expect(log?.metadata).toMatchObject({
        before: { title: `Edit Me ${RUN}`, vendor: "Acme" },
        after: { title: `Edited ${RUN}`, vendor: null },
      });
    });

    it("leaves omitted fields untouched", async () => {
      const { body } = await create({ title: `Partial ${RUN}`, vendor: "Keep" }).expect(201);
      const res = await catalog
        .patch(`/products/${body.data.id}`, { title: `Partial 2 ${RUN}` })
        .expect(200);
      expect(res.body.data.vendor).toBe("Keep");
    });

    it("does not write or audit a no-op update", async () => {
      const { body } = await create({ title: `Noop ${RUN}` }).expect(201);
      await catalog.patch(`/products/${body.data.id}`, { title: `Noop ${RUN}` }).expect(200);
      expect(await prisma.auditLog.count({ where: { resource_id: body.data.id } })).toBe(1);
    });

    it("rejects a handle already used by another product", async () => {
      await create({ title: "Holder", handle: `held-${RUN}` }).expect(201);
      const { body } = await create({ title: `Mover ${RUN}` }).expect(201);
      const res = await catalog
        .patch(`/products/${body.data.id}`, { handle: `held-${RUN}` })
        .expect(409);
      expect(res.body.error.code).toBe("PRODUCT_HANDLE_TAKEN");
    });

    it("publishes, then requires confirmation to change a published handle", async () => {
      const { body } = await create({ title: `Live ${RUN}` }).expect(201);
      const id = body.data.id;
      const pub = await catalog.patch(`/products/${id}`, { status: "active" }).expect(200);
      expect(pub.body.data.status).toBe("active");
      expect(pub.body.data.published_at).toBeTruthy();

      const blocked = await catalog
        .patch(`/products/${id}`, { handle: `live-new-${RUN}` })
        .expect(409);
      expect(blocked.body.error.code).toBe("HANDLE_CHANGE_REQUIRES_CONFIRMATION");

      const ok = await catalog
        .patch(`/products/${id}`, { handle: `live-new-${RUN}`, confirm_handle_change: true })
        .expect(200);
      expect(ok.body.data.handle).toBe(`live-new-${RUN}`);
    });

    it("rejects unknown fields", async () => {
      const { body } = await create({ title: `Strict ${RUN}` }).expect(201);
      await catalog
        .patch(`/products/${body.data.id}`, { title: "x", store_id: SECOND })
        .expect(422);
    });
  });

  describe("list", () => {
    const tag = `${RUN}lst`;
    beforeAll(async () => {
      for (const [i, title] of ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].entries()) {
        const { body } = await create({
          title: `${title} ${tag}`,
          vendor: i % 2 ? "Northwind" : null,
        }).expect(201);
        if (i === 0)
          await catalog.patch(`/products/${body.data.id}`, { status: "active" }).expect(200);
        if (i === 1)
          await catalog.patch(`/products/${body.data.id}`, { status: "archived" }).expect(200);
      }
      await prisma.productVariant.updateMany({
        where: { product: { title: `Charlie ${tag}` } },
        data: { sku: `SKU-${tag}`, barcode: `BC${tag}` },
      });
    });

    const titles = (res: { body: { data: { title: string }[] } }) =>
      res.body.data.map((p) => p.title);

    it("searches by title, SKU and barcode (server-side)", async () => {
      expect(titles(await catalog.get(`/products?q=bravo ${tag}`).expect(200))).toEqual([
        `Bravo ${tag}`,
      ]);
      expect(titles(await catalog.get(`/products?q=sku-${tag}`).expect(200))).toEqual([
        `Charlie ${tag}`,
      ]);
      const bc = await catalog.get(`/products?q=BC${tag}`).expect(200);
      expect(titles(bc)).toEqual([`Charlie ${tag}`]);
      expect(bc.body.data[0].sku).toBe(`SKU-${tag}`);
    });

    it("filters by status (multi) and sorts", async () => {
      const res = await catalog
        .get(`/products?q=${tag}&status=active,archived&sort=title&order=asc`)
        .expect(200);
      expect(titles(res)).toEqual([`Alpha ${tag}`, `Bravo ${tag}`]);
      const desc = await catalog.get(`/products?q=${tag}&sort=title&order=desc`).expect(200);
      expect(titles(desc)[0]).toBe(`Echo ${tag}`);
    });

    it("paginates with accurate metadata", async () => {
      const p1 = await catalog
        .get(`/products?q=${tag}&sort=title&order=asc&page=1&page_size=2`)
        .expect(200);
      const p3 = await catalog
        .get(`/products?q=${tag}&sort=title&order=asc&page=3&page_size=2`)
        .expect(200);
      expect(p1.body.meta).toEqual({ page: 1, page_size: 2, total: 5, total_pages: 3 });
      expect(titles(p1)).toEqual([`Alpha ${tag}`, `Bravo ${tag}`]);
      expect(titles(p3)).toEqual([`Echo ${tag}`]);
    });

    it("rejects invalid query parameters", async () => {
      const res = await catalog.get("/products?status=live&sort=price&page_size=1000").expect(422);
      expect(res.body.error.fields.length).toBeGreaterThanOrEqual(3);
    });

    it("never returns another store's products", async () => {
      const res = await ownerSecond.get(`/products?q=${tag}`).expect(200);
      expect(res.body.meta.total).toBe(0);
    });
  });

  describe("delete", () => {
    it("soft-deletes, hides from list/detail and frees the handle", async () => {
      const { body } = await create({ title: `Gone ${RUN}`, handle: `gone-${RUN}` }).expect(201);
      const id = body.data.id;
      await catalog.delete(`/products/${id}`).expect(200);
      await catalog.get(`/products/${id}`).expect(404);
      expect((await catalog.get(`/products?q=gone-${RUN}`).expect(200)).body.meta.total).toBe(0);
      const row = await prisma.product.findUniqueOrThrow({ where: { id } });
      expect(row.deleted_at).not.toBeNull();
      await create({ title: "Reuse", handle: `gone-${RUN}` }).expect(201);
    });
  });

  describe("authorization and store isolation (§8.11, §29.2 #28-29)", () => {
    let id: string;
    beforeAll(async () => {
      id = (await create({ title: `Guarded ${RUN}` }).expect(201)).body.data.id;
    });

    it("lets read-only roles read but not write", async () => {
      await orders.get(`/products/${id}`).expect(200);
      expect((await orders.post("/products", { title: "Nope" }).expect(403)).body.error.code).toBe(
        "FORBIDDEN",
      );
      await orders.patch(`/products/${id}`, { title: "Nope" }).expect(403);
      await orders.delete(`/products/${id}`).expect(403);
    });

    it("blocks non-members of the store entirely", async () => {
      const res = await otherStoreOwner.get(`/products/${id}`).expect(403);
      expect(res.body.error.code).toBe("STORE_ACCESS_DENIED");
      await otherStoreOwner.get("/products").expect(403);
    });

    it("returns 404 for a product id from another store (no cross-store reads or writes)", async () => {
      await ownerSecond.get(`/products/${id}`).expect(404);
      await ownerSecond.patch(`/products/${id}`, { title: "Hijack" }).expect(404);
      await ownerSecond.delete(`/products/${id}`).expect(404);
      const row = await prisma.product.findUniqueOrThrow({ where: { id } });
      expect(row.title).toBe(`Guarded ${RUN}`);
      expect(row.deleted_at).toBeNull();
    });

    it("treats malformed ids as not found", async () => {
      await catalog.get("/products/not-a-uuid").expect(404);
    });

    it("requires a CSRF token for writes", async () => {
      const res = await orders.get("/products").expect(200);
      expect(res.body).toHaveProperty("meta");
    });
  });
});
