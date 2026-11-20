import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_STORES } from "@cartforge/database/seed";
import { api, createTestApp, login, RUN } from "./app";

const MAIN = SEED_STORES.main.id;
const SECOND = SEED_STORES.second.id;
const SECRET = "revalidate-secret-0123456789abcdef";

interface Hit {
  secret: string | undefined;
  body: unknown;
}

/** Stands in for the storefront's revalidation endpoint. */
async function captureServer(): Promise<{ server: Server; url: string; hits: Hit[] }> {
  const hits: Hit[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      hits.push({ secret: req.headers["x-revalidate-secret"] as string, body: JSON.parse(raw) });
      res.writeHead(200).end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}/api/revalidate`, hits };
}

describe("storefront foundation (Next 2)", () => {
  let app: INestApplication;
  let catalog: ReturnType<typeof api>;
  let otherStore: ReturnType<typeof api>;
  let capture: Awaited<ReturnType<typeof captureServer>>;
  const pub = (path: string, store: string = MAIN) =>
    request(app.getHttpServer()).get(`/api/v1/storefront${path}`).set("X-Store-Id", store);

  beforeAll(async () => {
    capture = await captureServer();
    // Env is read when the app module is built; this file runs in its own worker.
    process.env.STOREFRONT_REVALIDATE_URL = capture.url;
    process.env.STOREFRONT_REVALIDATE_SECRET = SECRET;
    process.env.STOREFRONT_URL = "https://shop.example.test/";
    app = await createTestApp();
    catalog = api(app, await login(app, "catalog@cartforge.test"), MAIN);
    otherStore = api(app, await login(app, "other@cartforge.test"), SECOND);
  });
  afterAll(async () => {
    await app.close();
    await new Promise((r) => capture.server.close(r));
  });

  it("exposes store identity", async () => {
    const res = await pub("/store").expect(200);
    expect(res.body.data).toEqual({
      id: MAIN,
      name: SEED_STORES.main.name,
      currency: "USD",
      locale: expect.any(String),
      contact_email: expect.any(String),
    });
  });

  describe("categories and collections", () => {
    let root: { id: string; handle: string };
    let child: { id: string; handle: string };
    let hiddenParent: { id: string; handle: string };
    let underHidden: { id: string; handle: string };

    beforeAll(async () => {
      root = (await catalog.post("/categories", { name: `Kitchen ${RUN}` }).expect(201)).body.data;
      child = (
        await catalog.post("/categories", { name: `Knives ${RUN}`, parent_id: root.id }).expect(201)
      ).body.data;
      hiddenParent = (await catalog.post("/categories", { name: `Retired ${RUN}` }).expect(201))
        .body.data;
      underHidden = (
        await catalog
          .post("/categories", { name: `Orphan ${RUN}`, parent_id: hiddenParent.id })
          .expect(201)
      ).body.data;
      await catalog.patch(`/categories/${hiddenParent.id}`, { status: "archived" }).expect(200);
      // One product in both root and child (counted once), one draft (not counted).
      await catalog
        .post("/products", {
          title: `Chef knife ${RUN}`,
          price_minor: 5000,
          status: "active",
          category_ids: [root.id, child.id],
        })
        .expect(201);
      await catalog
        .post("/products", { title: `Draft knife ${RUN}`, category_ids: [child.id] })
        .expect(201);
    });

    it("lists the visible tree in order with subtree counts", async () => {
      const list = (await pub("/categories").expect(200)).body.data as {
        id: string;
        depth: number;
        product_count: number;
      }[];
      const ids = list.map((c) => c.id);
      expect(ids.indexOf(child.id)).toBe(ids.indexOf(root.id) + 1);
      expect(list.find((c) => c.id === root.id)).toMatchObject({ depth: 0, product_count: 1 });
      expect(list.find((c) => c.id === child.id)).toMatchObject({ depth: 1, product_count: 1 });
      // Archived categories hide their whole subtree.
      expect(ids).not.toContain(hiddenParent.id);
      expect(ids).not.toContain(underHidden.id);
    });

    it("serves a category with breadcrumbs and children", async () => {
      const c = (await pub(`/categories/${child.handle}`).expect(200)).body.data;
      expect(c.ancestors).toEqual([{ name: `Kitchen ${RUN}`, handle: root.handle }]);
      expect(c.seo.title).toBe(`Knives ${RUN}`);
      const r = (await pub(`/categories/${root.handle}`).expect(200)).body.data;
      expect(r.children).toEqual([{ name: `Knives ${RUN}`, handle: child.handle }]);
      await pub(`/categories/${underHidden.handle}`).expect(404);
    });

    it("puts the deepest category first on products for breadcrumbs", async () => {
      const list = (await pub(`/products?q=${encodeURIComponent(`Chef knife ${RUN}`)}`).expect(200))
        .body.data;
      expect(list[0].categories.map((c: { handle: string }) => c.handle)).toEqual([
        child.handle,
        root.handle,
      ]);
      expect(list[0].updated_at).toEqual(expect.any(String));
    });

    it("lists only active collections, counting only active products", async () => {
      const active = (
        await catalog.post("/collections", { title: `Gifts ${RUN}`, status: "active" }).expect(201)
      ).body.data;
      await catalog.post("/collections", { title: `Draft col ${RUN}` }).expect(201);
      const p = (
        await catalog
          .post("/products", { title: `Gift ${RUN}`, price_minor: 100, status: "active" })
          .expect(201)
      ).body.data;
      const d = (await catalog.post("/products", { title: `Gift draft ${RUN}` }).expect(201)).body
        .data;
      await catalog.put(`/collections/${active.id}/products`, { product_ids: [p.id, d.id] });
      const cols = (await pub("/collections").expect(200)).body.data as {
        title: string;
        product_count: number;
      }[];
      expect(cols.find((c) => c.title === `Gifts ${RUN}`)?.product_count).toBe(1);
      expect(cols.some((c) => c.title === `Draft col ${RUN}`)).toBe(false);
    });
  });

  it("builds a sitemap from active, visible content only", async () => {
    const live = (
      await catalog
        .post("/products", { title: `Mapped ${RUN}`, price_minor: 100, status: "active" })
        .expect(201)
    ).body.data;
    const draft = (await catalog.post("/products", { title: `Unmapped ${RUN}` }).expect(201)).body
      .data;
    const map = (await pub("/sitemap").expect(200)).body.data;
    const handles = map.products.map((p: { handle: string }) => p.handle);
    expect(handles).toContain(live.handle);
    expect(handles).not.toContain(draft.handle);
  });

  describe("draft preview", () => {
    let draft: { id: string; handle: string };
    let token: string;

    beforeAll(async () => {
      draft = (
        await catalog
          .post("/products", { title: `Preview me ${RUN}`, price_minor: 2500 })
          .expect(201)
      ).body.data;
      const link = (await catalog.post(`/products/${draft.id}/preview-link`).expect(200)).body.data;
      token = link.token;
      expect(link.path).toBe(`/preview/products/${draft.id}?token=${encodeURIComponent(token)}`);
      expect(link.url).toBe(`https://shop.example.test${link.path}`);
      expect(Date.parse(link.expires_at)).toBeGreaterThan(Date.now() + 50 * 60_000);
    });

    it("shows a draft with a valid token, uncached and unindexed", async () => {
      await pub(`/products/${draft.handle}`).expect(404);
      const res = await pub(
        `/preview/products/${draft.id}?token=${encodeURIComponent(token)}`,
      ).expect(200);
      expect(res.body.data).toMatchObject({ id: draft.id, status: "draft", price_min_minor: 2500 });
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(res.headers["x-robots-tag"]).toBe("noindex");
    });

    it("refuses missing, tampered, foreign and mismatched tokens", async () => {
      await pub(`/preview/products/${draft.id}`).expect(404);
      await pub(`/preview/products/${draft.id}?token=${token}x`).expect(404);
      await pub(`/preview/products/${draft.id}?token=${encodeURIComponent(token)}`, SECOND).expect(
        404,
      );
      const other = (
        await catalog.post("/products", { title: `Other ${RUN}`, price_minor: 1 }).expect(201)
      ).body.data;
      await pub(`/preview/products/${other.id}?token=${encodeURIComponent(token)}`).expect(404);
      // Staff of another store can't mint a link for this product.
      await otherStore.post(`/products/${draft.id}/preview-link`).expect(404);
    });
  });

  describe("cache revalidation", () => {
    it("notifies the storefront after catalog writes, not reads or dry runs", async () => {
      capture.hits.length = 0;
      const p = (
        await catalog.post("/products", { title: `Notify ${RUN}`, price_minor: 100 }).expect(201)
      ).body.data;
      expect(capture.hits).toEqual([{ secret: SECRET, body: { tags: ["catalog"] } }]);

      await catalog.get(`/products/${p.id}`).expect(200);
      await catalog.post(`/products/${p.id}/preview-link`).expect(200);
      expect(capture.hits).toHaveLength(1);

      await catalog.post("/categories", { name: `Notify cat ${RUN}` }).expect(201);
      expect(capture.hits).toHaveLength(2);
    });

    it("does not notify when the write fails", async () => {
      capture.hits.length = 0;
      await catalog.post("/products", { title: "" }).expect(422);
      expect(capture.hits).toHaveLength(0);
    });

    it("never fails a write when the storefront is unreachable", async () => {
      await new Promise((r) => capture.server.close(r));
      const res = await catalog
        .post("/products", { title: `Offline ${RUN}`, price_minor: 100 })
        .expect(201);
      expect(res.body.data.title).toBe(`Offline ${RUN}`);
      capture.server.listen(0, "127.0.0.1"); // afterAll closes it again
    });
  });
});
