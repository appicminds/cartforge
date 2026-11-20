import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { SEED_PASSWORD, SEED_STORES } from "@cartforge/database/seed";
import { DNS_RESOLVER } from "../src/platform/domain-provider";
import { api, createTestApp, login, RUN, type Session } from "./app";
import { TEST_ENV } from "./test-env";

const PLATFORM = "shops.test";
const txt = new Map<string, string[]>();
const fakeDns = {
  resolveTxt: async (name: string) => {
    const v = txt.get(name);
    if (!v) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return v.map((x) => [x]);
  },
};

/**
 * P1 — SaaS foundation: sign-up provisions an isolated store, stores get a
 * platform subdomain, custom domains need DNS proof, the shared storefront
 * resolves hosts, and platform admins can suspend stores.
 */
describe("platform / SaaS edition (P1)", () => {
  let app: INestApplication;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  const http = () => request(app.getHttpServer());
  const email = (tag: string) => `${tag}-${RUN}@example.com`.toLowerCase();
  const handle = (tag: string) => `${tag}-${RUN}`.toLowerCase();

  const signup = (over: object = {}) =>
    http()
      .post("/api/v1/auth/signup")
      .send({
        name: "Grace",
        email: email("grace"),
        password: "correct horse 42",
        store_name: `Grace Goods ${RUN}`,
        currency: "EUR",
        ...over,
      });

  const sessionFrom = (res: request.Response): Session => {
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    return {
      cookies: cookies.map((c) => c.split(";")[0]!),
      csrf: cookies
        .find((c) => c.startsWith("cf_csrf="))!
        .split(";")[0]!
        .split("=")[1]!,
    };
  };

  beforeAll(async () => {
    process.env.CARTFORGE_EDITION = "saas";
    process.env.PLATFORM_DOMAIN = PLATFORM;
    process.env.STOREFRONT_URL = "https://shared.example.test";
    app = await createTestApp([{ provide: DNS_RESOLVER, useValue: fakeDns }]);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it("publishes the edition for the admin UI", async () => {
    const res = await http().get("/api/v1/platform/config").expect(200);
    expect(res.body.data).toEqual({
      edition: "saas",
      signup_enabled: true,
      platform_domain: PLATFORM,
      email: "logged", // no email provider in tests: links go to the log
    });
  });

  let grace: Session;
  let graceStore: { store_id: string; store_handle: string };

  it("signs up a merchant with a complete, isolated store and signs them in", async () => {
    const res = await signup({ handle: handle("grace") }).expect(201);
    grace = sessionFrom(res);
    const me = res.body.data;
    expect(me).toMatchObject({
      email: email("grace"),
      is_platform_admin: false,
      can_create_stores: true,
    });
    expect(me.stores).toHaveLength(1);
    graceStore = me.stores[0];
    expect(graceStore).toMatchObject({
      store_handle: handle("grace"),
      role_key: "owner",
      store_status: "active",
      store_url: `https://${handle("grace")}.${PLATFORM}`,
    });
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: graceStore.store_id },
      include: { roles: true, inventory_locations: true, domains: true },
    });
    expect(store).toMatchObject({ currency: "EUR", plan: "trial", status: "active" });
    expect(store.roles.map((r) => r.key).sort()).toEqual([
      "admin",
      "catalog_manager",
      "content_designer",
      "order_manager",
      "owner",
    ]);
    expect(store.inventory_locations).toHaveLength(1);
    expect(store.domains).toEqual([
      expect.objectContaining({ kind: "platform", status: "active", is_primary: true }),
    ]);

    // The new store works right away and sees nothing from other stores.
    const g = api(app, grace, graceStore.store_id);
    expect((await g.get("/products").expect(200)).body.meta.total).toBe(0);
    await api(app, grace, SEED_STORES.main.id).get("/products").expect(403);
  });

  it("rejects duplicate emails, taken or reserved addresses, and weak passwords", async () => {
    const dupe = await signup().expect(409);
    expect(dupe.body.error.code).toBe("EMAIL_TAKEN");
    const taken = await signup({ email: email("other"), handle: handle("grace") }).expect(409);
    expect(taken.body.error.code).toBe("HANDLE_TAKEN");
    await signup({ email: email("reserved"), handle: "admin" }).expect(422);
    await signup({ email: email("weak"), password: "short" }).expect(422);
  });

  it("derives a free address from the store name when none is given", async () => {
    const a = await signup({ email: email("a1"), store_name: `Same Name ${RUN}` }).expect(201);
    const b = await signup({ email: email("a2"), store_name: `Same Name ${RUN}` }).expect(201);
    const ha = a.body.data.stores[0].store_handle;
    const hb = b.body.data.stores[0].store_handle;
    expect(ha).toBe(handle("same-name"));
    expect(hb).toBe(`${handle("same-name")}-2`);
    const check = await http().get(`/api/v1/stores/handle-available?handle=${ha}`).expect(200);
    expect(check.body.data).toMatchObject({ available: false });
    const free = await http()
      .get(`/api/v1/stores/handle-available?handle=${handle("free")}`)
      .expect(200);
    expect(free.body.data).toMatchObject({ available: true });
  });

  it("lets a merchant open another store, kept separate (Shopify-style)", async () => {
    const res = await api(app, grace, graceStore.store_id)
      .post("/stores", { store_name: `Grace Outlet ${RUN}`, currency: "USD" })
      .expect(201);
    expect(res.body.data.url).toMatch(
      new RegExp(`^https://grace-outlet-.*\\.${PLATFORM.replace(".", "\\.")}$`),
    );
    const me = (await http().get("/api/v1/auth/me").set("Cookie", grace.cookies).expect(200)).body
      .data;
    expect(me.stores).toHaveLength(2);
  });

  it("previews a store on the shared storefront by its handle", async () => {
    const res = await http()
      .get(`/api/v1/storefront/resolve?handle=${handle("grace")}`)
      .expect(200);
    expect(res.body.data).toMatchObject({
      store_id: graceStore.store_id,
      url: `https://${handle("grace")}.${PLATFORM}`,
    });
    await http().get(`/api/v1/storefront/resolve?handle=no-such-${RUN}`).expect(404);
    await http().get("/api/v1/storefront/resolve?handle=..%2Fadmin").expect(404);
    await http().get("/api/v1/storefront/resolve").expect(404);

    const me = (await http().get("/api/v1/auth/me").set("Cookie", grace.cookies).expect(200)).body
      .data;
    const s = me.stores.find((x: { store_id: string }) => x.store_id === graceStore.store_id);
    expect(s.store_preview_url).toBe(`https://shared.example.test/?store=${handle("grace")}`);

    // Draft preview links use the store's own address when it has one.
    const g = api(app, grace, graceStore.store_id);
    const p = (await g.post("/products", { title: `Peek ${RUN}`, price_minor: 100 }).expect(201))
      .body.data;
    const link = (await g.post(`/products/${p.id}/preview-link`).expect(200)).body.data;
    expect(link.url).toBe(`https://${handle("grace")}.${PLATFORM}${link.path}`);
  });

  describe("domains", () => {
    let domainId: string;
    const host = `shop-${RUN}.example.com`.toLowerCase();

    it("connects a custom domain only after DNS proof", async () => {
      const g = api(app, grace, graceStore.store_id);
      const added = (
        await g.post("/domains", { hostname: `https://${host.toUpperCase()}/` }).expect(201)
      ).body.data;
      domainId = added.id;
      expect(added).toMatchObject({
        hostname: host,
        kind: "custom",
        status: "pending",
        is_primary: false,
      });
      const record = added.dns.find((d: { type: string }) => d.type === "TXT");
      expect(record.name).toBe(`_cartforge-verify.${host}`);

      // Not resolvable yet.
      const early = await g.post(`/domains/${domainId}/verify`).expect(422);
      expect(early.body.error.code).toBe("DOMAIN_NOT_VERIFIED");
      await http().get(`/api/v1/storefront/resolve?host=${host}`).expect(404);
      await http().get(`/api/v1/platform/domains/tls-check?domain=${host}`).expect(404);

      txt.set(record.name, ["unrelated", record.value]);
      const ok = (await g.post(`/domains/${domainId}/verify`).expect(200)).body.data;
      expect(ok).toMatchObject({ status: "active", last_error: null });
      await http().get(`/api/v1/platform/domains/tls-check?domain=${host}`).expect(200);
    });

    it("makes a domain primary and resolves hosts (incl. www) to the store", async () => {
      const g = api(app, grace, graceStore.store_id);
      const list = (await g.post(`/domains/${domainId}/primary`).expect(200)).body.data;
      expect(list[0]).toMatchObject({ hostname: host, is_primary: true });
      for (const h of [
        host,
        `www.${host}`,
        `${handle("grace")}.${PLATFORM}`,
        `${host.toUpperCase()}:443`,
      ]) {
        const r = (
          await http()
            .get(`/api/v1/storefront/resolve?host=${encodeURIComponent(h)}`)
            .expect(200)
        ).body.data;
        expect(r).toEqual({
          store_id: graceStore.store_id,
          name: `Grace Goods ${RUN}`,
          url: `https://${host}`,
        });
      }
      await http().get("/api/v1/storefront/resolve?host=nope.example.org").expect(404);
    });

    it("keeps hostnames exclusive and the platform address permanent", async () => {
      const other = sessionFrom(
        await signup({ email: email("rival"), store_name: `Rival ${RUN}` }).expect(201),
      );
      const rivalStore = (await http().get("/api/v1/auth/me").set("Cookie", other.cookies)).body
        .data.stores[0];
      const r = api(app, other, rivalStore.store_id);
      const taken = await r.post("/domains", { hostname: host }).expect(409);
      expect(taken.body.error.code).toBe("DOMAIN_TAKEN");
      await r.post("/domains", { hostname: `x.${PLATFORM}` }).expect(422);
      // Another store can't touch Grace's domain.
      await r.post(`/domains/${domainId}/primary`).expect(404);
      await r.delete(`/domains/${domainId}`).expect(404);
      // An unverified claim doesn't block the real owner.
      const contested = `contested-${RUN}.example.com`.toLowerCase();
      await r.post("/domains", { hostname: contested }).expect(201);
      const g = api(app, grace, graceStore.store_id);
      await g.post("/domains", { hostname: contested }).expect(201);

      const platformDomain = (await g.get("/domains").expect(200)).body.data.find(
        (d: { kind: string }) => d.kind === "platform",
      );
      await g.delete(`/domains/${platformDomain.id}`).expect(422);
      // Removing the primary custom domain falls back to the platform address.
      await g.delete(`/domains/${domainId}`).expect(204);
      const after = (await g.get("/domains").expect(200)).body.data;
      expect(after.find((d: { is_primary: boolean }) => d.is_primary).kind).toBe("platform");
    });
  });

  describe("platform administration", () => {
    let admin: Session;
    beforeAll(async () => {
      admin = await login(app, "platform@cartforge.test", SEED_PASSWORD);
    });

    it("is only for platform admins", async () => {
      await http().get("/api/v1/platform/stores").set("Cookie", grace.cookies).expect(403);
      await http().get("/api/v1/platform/stores").expect(401);
    });

    it("lists stores with owner, domain and counts", async () => {
      const res = await http()
        .get(`/api/v1/platform/stores?q=${handle("grace")}`)
        .set("Cookie", admin.cookies)
        .expect(200);
      const row = res.body.data.find((r: { handle: string }) => r.handle === handle("grace"));
      expect(row).toMatchObject({
        handle: handle("grace"),
        owner_email: email("grace"),
        status: "active",
        plan: "trial",
        product_count: 1, // the draft from the preview-link test
        order_count: 0,
      });
    });

    it("suspends a store everywhere, and reactivates it", async () => {
      const patch = (body: object) =>
        http()
          .patch(`/api/v1/platform/stores/${graceStore.store_id}`)
          .set("Cookie", admin.cookies)
          .set("X-CSRF-Token", admin.csrf)
          .send(body);
      await patch({ status: "suspended" }).expect(422); // reason required
      await patch({ status: "suspended", reason: "Payment overdue" }).expect(200);

      await api(app, grace, graceStore.store_id).get("/products").expect(403);
      await http()
        .get(`/api/v1/storefront/resolve?host=${handle("grace")}.${PLATFORM}`)
        .expect(404);
      await http()
        .get(`/api/v1/storefront/resolve?handle=${handle("grace")}`)
        .expect(404);
      const me = (await http().get("/api/v1/auth/me").set("Cookie", grace.cookies)).body.data;
      expect(
        me.stores.find((s: { store_id: string }) => s.store_id === graceStore.store_id)
          .store_status,
      ).toBe("suspended");

      await patch({ status: "active" }).expect(200);
      await api(app, grace, graceStore.store_id).get("/products").expect(200);
      await http()
        .get(`/api/v1/storefront/resolve?handle=${handle("grace")}`)
        .expect(200);
    });
  });
});
