import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { SEED_STORES } from "@cartforge/database/seed";
import { api, createTestApp, login, RUN } from "./app";
import { TEST_ENV } from "./test-env";

const MAIN = SEED_STORES.main.id;
const SECOND = SEED_STORES.second.id;

const US = {
  first_name: "Ada",
  last_name: "Lovelace",
  address1: "1 Analytical Way",
  city: "Springfield",
  region: "IL",
  postal_code: "62701",
  country: "US",
};

/**
 * Next 4 — cart, checkout and order creation (PRD §13.1–13.3, INV-003/004,
 * BE-009). Real database and Redis; amounts are always computed server-side.
 */
describe("cart and checkout (Next 4)", () => {
  let app: INestApplication;
  let owner: ReturnType<typeof api>;
  let ordersStaff: ReturnType<typeof api>;
  let catalogStaff: ReturnType<typeof api>;
  let otherOwner: ReturnType<typeof api>;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  let standard: { id: string };
  let express: { id: string };

  const shop = (store = MAIN) => {
    let token = "";
    const call = (method: "get" | "post" | "patch" | "delete", path: string) => {
      const agent = request(app.getHttpServer());
      const r = agent[method](`/api/v1/storefront${path}`).set("X-Store-Id", store);
      return token ? r.set("X-Cart-Token", token) : r;
    };
    return {
      get token() {
        return token;
      },
      async start() {
        const res = await call("post", "/cart").expect(201);
        token = res.body.data.token;
        return res.body.data.cart;
      },
      get: (p: string) => call("get", p),
      post: (p: string, body: object = {}) => call("post", p).send(body),
      patch: (p: string, body: object) => call("patch", p).send(body),
      delete: (p: string) => call("delete", p),
      complete: (key: string | null, body: object = {}) => {
        const r = call("post", "/checkout/complete");
        return (key ? r.set("Idempotency-Key", key) : r).send(body);
      },
    };
  };

  const product = async (title: string, over: object = {}) => {
    const p = (
      await owner
        .post("/products", {
          title: `${title} ${RUN}`,
          price_minor: 2000,
          status: "active",
          inventory_quantity: 10,
          ...over,
        })
        .expect(201)
    ).body.data;
    return { ...p, variant_id: p.variants[0].id as string };
  };

  const level = async (variantId: string) =>
    prisma.inventoryLevel.findFirstOrThrow({ where: { variant_id: variantId } });

  beforeAll(async () => {
    app = await createTestApp();
    owner = api(app, await login(app, "owner@cartforge.test"), MAIN);
    ordersStaff = api(app, await login(app, "orders@cartforge.test"), MAIN);
    catalogStaff = api(app, await login(app, "catalog@cartforge.test"), MAIN);
    otherOwner = api(app, await login(app, "other@cartforge.test"), SECOND);
    await owner
      .put("/settings/checkout", {
        tax_rate_bps: 1000,
        tax_label: "Sales tax",
        prices_include_tax: false,
        tax_shipping: false,
        phone: "optional",
        reservation_minutes: 15,
        terms_required: true,
        terms_label: "I accept the terms",
        terms_url: "/pages/terms",
        custom_fields: [
          {
            key: "delivery",
            label: "Delivery window",
            type: "select",
            required: true,
            options: ["Morning", "Afternoon"],
          },
          { key: "gift_note", label: "Gift note", type: "textarea" },
        ],
        cod_enabled: true,
        cod_instructions: "Have exact change ready.",
        bank_transfer_enabled: true,
        bank_transfer_instructions: "IBAN DE00 1234",
      })
      .expect(200);
    // Clean slate for this store's shipping methods.
    await prisma.shippingMethod.deleteMany({ where: { store_id: MAIN } });
    standard = (
      await owner
        .post("/shipping-methods", {
          name: "Standard",
          price_minor: 500,
          free_over_minor: 10000,
          countries: ["US", "CA"],
        })
        .expect(201)
    ).body.data;
    express = (
      await owner
        .post("/shipping-methods", { name: "Express", price_minor: 1500, countries: ["US"] })
        .expect(201)
    ).body.data;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe("settings", () => {
    it("validates and protects checkout settings and shipping methods", async () => {
      const bad = await owner
        .put("/settings/checkout", { bank_transfer_enabled: true, bank_transfer_instructions: "" })
        .expect(422);
      expect(bad.body.error.fields[0].path).toBe("bank_transfer_instructions");
      await catalogStaff.put("/settings/checkout", {}).expect(403);
      await catalogStaff.post("/shipping-methods", { name: "X", price_minor: 1 }).expect(403);
      await owner.post("/shipping-methods", { name: "", price_minor: -1 }).expect(422);
      await otherOwner.patch(`/shipping-methods/${standard.id}`, { name: "Hijack" }).expect(404);
      const list = (await ordersStaff.get("/shipping-methods").expect(200)).body.data;
      expect(list.map((m: { name: string }) => m.name)).toEqual(["Standard", "Express"]);
    });
  });

  describe("cart", () => {
    it("rejects unknown tokens and foreign or unpublished items", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/storefront/cart")
        .set("X-Store-Id", MAIN)
        .set("X-Cart-Token", "x".repeat(43))
        .expect(404);
      const s = shop();
      await s.start();
      const draft = (
        await owner.post("/products", { title: `Draft ${RUN}`, price_minor: 100 }).expect(201)
      ).body.data;
      await s.post("/cart/lines", { variant_id: draft.variants[0].id }).expect(422);
      const foreign = (
        await otherOwner
          .post("/products", { title: `Foreign ${RUN}`, price_minor: 100, status: "active" })
          .expect(201)
      ).body.data;
      await s.post("/cart/lines", { variant_id: foreign.variants[0].id }).expect(422);
      // A cart belongs to one store.
      await request(app.getHttpServer())
        .get("/api/v1/storefront/cart")
        .set("X-Store-Id", SECOND)
        .set("X-Cart-Token", s.token)
        .expect(404);
    });

    it("merges quantities, caps them at stock and never trusts client prices", async () => {
      const p = await product("Teapot", { inventory_quantity: 3 });
      const s = shop();
      await s.start();
      await s.post("/cart/lines", { variant_id: p.variant_id, quantity: 2 }).expect(201);
      const res = await s
        .post("/cart/lines", { variant_id: p.variant_id, quantity: 2 })
        .expect(201);
      expect(res.body.data.lines[0]).toMatchObject({
        quantity: 3,
        unit_price_minor: 2000,
        max_quantity: 3,
      });
      expect(res.body.data.notices[0]).toMatchObject({ kind: "quantity_reduced" });
      await s
        .post("/cart/lines", { variant_id: p.variant_id, quantity: 1, price_minor: 1 })
        .expect(422); // unknown fields are rejected outright
    });

    it("reports price changes once and drops items that stop being sold", async () => {
      const a = await product("Kettle");
      const b = await product("Toaster");
      const s = shop();
      await s.start();
      await s.post("/cart/lines", { variant_id: a.variant_id }).expect(201);
      await s.post("/cart/lines", { variant_id: b.variant_id }).expect(201);
      await owner.patch(`/products/${a.id}`, { price_minor: 2500 }).expect(200);
      await owner.post(`/products/${b.id}/archive`).expect(200);
      const first = (await s.get("/cart").expect(200)).body.data;
      expect(first.notices.map((n: { kind: string }) => n.kind).sort()).toEqual([
        "price_changed",
        "removed_unavailable",
      ]);
      expect(
        first.notices.find((n: { kind: string }) => n.kind === "price_changed").message,
      ).toContain("from $20.00 to $25.00");
      expect(first.lines).toHaveLength(1);
      expect(first.subtotal_minor).toBe(2500);
      const again = (await s.get("/cart").expect(200)).body.data;
      expect(again.notices).toEqual([]);
    });

    it("updates and removes lines", async () => {
      const p = await product("Mug");
      const s = shop();
      await s.start();
      const line = (await s.post("/cart/lines", { variant_id: p.variant_id }).expect(201)).body.data
        .lines[0];
      expect(
        (await s.patch(`/cart/lines/${line.id}`, { quantity: 4 }).expect(200)).body.data,
      ).toMatchObject({
        item_count: 4,
        subtotal_minor: 8000,
      });
      expect((await s.delete(`/cart/lines/${line.id}`).expect(200)).body.data.lines).toEqual([]);
      await s.delete(`/cart/lines/${line.id}`).expect(404);
      await s.post("/checkout").expect(422); // empty cart can't check out
    });
  });

  describe("checkout", () => {
    it("walks through checkout with server-computed totals and places one order", async () => {
      const p = await product("Lamp", { price_minor: 4550, inventory_quantity: 5 });
      const s = shop();
      await s.start();
      await s.post("/cart/lines", { variant_id: p.variant_id, quantity: 2 }).expect(201);

      // Opening checkout holds stock.
      let view = (await s.post("/checkout").expect(200)).body.data;
      expect((await level(p.variant_id)).reserved).toBe(2);
      expect(view.missing).toEqual(
        expect.arrayContaining([
          "email",
          "shipping_address",
          "payment_method",
          "custom_fields",
          "terms",
        ]),
      );
      expect(view.reserved_until).toEqual(expect.any(String));

      // Validation and destination rules.
      const badAddr = await s
        .patch("/checkout", { shipping_address: { ...US, postal_code: "" } })
        .expect(422);
      expect(badAddr.body.error.fields.map((f: { path: string }) => f.path)).toContain(
        "shipping_address.postal_code",
      );
      const fr = await s
        .patch("/checkout", {
          shipping_address: { ...US, country: "FR", region: null, postal_code: "75001" },
        })
        .expect(422);
      expect(fr.body.error.fields[0].path).toBe("shipping_address.country");

      view = (
        await s.patch("/checkout", { email: "ADA@Example.com ", shipping_address: US }).expect(200)
      ).body.data;
      expect(view.email).toBe("ada@example.com");
      expect(view.shipping_options.map((o: { name: string }) => o.name)).toEqual([
        "Standard",
        "Express",
      ]);
      expect(view.totals.shipping_minor).toBeNull();

      await s.patch("/checkout", { payment_method: "crypto" }).expect(422);
      await s.patch("/checkout", { custom_fields: { delivery: "Midnight" } }).expect(422);
      view = (
        await s
          .patch("/checkout", {
            shipping_method_id: express.id,
            payment_method: "bank_transfer",
            custom_fields: { delivery: "Morning", gift_note: "Happy birthday" },
            terms_accepted: true,
          })
          .expect(200)
      ).body.data;
      // 2 × 45.50 = 91.00; express 15.00; 10% tax on goods only = 9.10 → 115.10
      expect(view.totals).toMatchObject({
        subtotal_minor: 9100,
        shipping_minor: 1500,
        tax_minor: 910,
        total_minor: 11510,
        tax_label: "Sales tax",
      });
      expect(view.missing).toEqual([]);

      // Idempotency is required; a stale expected total stops the order.
      await s.complete(null).expect(400);
      const changed = await s.complete(`k1-${RUN}`, { expected_total_minor: 999 }).expect(409);
      expect(changed.body.error.code).toBe("CHECKOUT_CHANGED");

      const placed = await s.complete(`k2-${RUN}`, { expected_total_minor: 11510 }).expect(201);
      const order = placed.body.data;
      expect(order).toMatchObject({ total_minor: 11510, currency: "USD" });
      expect(order.number).toMatch(/^\d{4,}$/);

      // Same key → same result, flagged as a replay; another key can't place a second order.
      const replay = await s.complete(`k2-${RUN}`, { expected_total_minor: 11510 }).expect(201);
      expect(replay.body.data).toEqual(order);
      expect(replay.headers["idempotent-replayed"]).toBe("true");
      const again = await s.complete(`k3-${RUN}`, {}).expect(409);
      expect(again.body.error.code).toBe("CHECKOUT_COMPLETED");
      await s.get("/cart").expect(404); // a converted cart is closed for shopping
      expect(await prisma.order.count({ where: { checkout_id: view.id } })).toBe(1);

      // Stock: holds consumed, on-hand reduced by a sale movement that points at the order.
      const lvl = await level(p.variant_id);
      expect(lvl).toMatchObject({ on_hand: 3, reserved: 0 });
      const mv = await prisma.stockMovement.findFirstOrThrow({
        where: { variant_id: p.variant_id, movement_type: "sale" },
      });
      expect(mv).toMatchObject({
        quantity_delta: -2,
        reference_type: "order",
        reference_id: order.order_id,
      });

      // Customer status page needs the secret key.
      const pub = (key: string) =>
        request(app.getHttpServer())
          .get(`/api/v1/storefront/orders/${order.order_id}`)
          .set("X-Store-Id", MAIN)
          .set("X-Order-Key", key);
      await pub("wrong-key").expect(404);
      const conf = (await pub(order.access_key).expect(200)).body.data;
      expect(conf).toMatchObject({
        number: order.number,
        payment_status: "pending",
        payment: { method: "bank_transfer", label: "Bank transfer" },
        shipping_method: { name: "Express", price_minor: 1500 },
        totals: { total_minor: 11510, tax_minor: 910, shipping_minor: 1500 },
      });
      expect(conf.payment.instructions).toContain(`order number ${order.number}`);
      expect(conf.lines[0]).toMatchObject({ quantity: 2, unit_price_minor: 4550, tax_minor: 910 });

      // Admin views.
      const list = (await ordersStaff.get(`/orders?q=${order.number}`).expect(200)).body.data;
      expect(list[0]).toMatchObject({
        number: order.number,
        item_count: 2,
        customer_name: "Ada Lovelace",
      });
      const detail = (await ordersStaff.get(`/orders/${order.order_id}`).expect(200)).body.data;
      expect(detail.custom_fields).toEqual([
        { key: "delivery", label: "Delivery window", value: "Morning" },
        { key: "gift_note", label: "Gift note", value: "Happy birthday" },
      ]);
      // (Plus the order emails, recorded as "email" events.)
      expect(
        detail.events.map((e: { type: string }) => e.type).filter((t: string) => t !== "email"),
      ).toEqual(["order.placed", "payment.pending"]);
      expect(detail.terms_accepted_at).toEqual(expect.any(String));
      await otherOwner.get(`/orders/${order.order_id}`).expect(404);
      await catalogStaff.get("/orders").expect(403);

      // Financial snapshot is immutable in the database itself.
      await expect(
        prisma.order.update({ where: { id: order.order_id }, data: { total_minor: 1n } }),
      ).rejects.toThrow(/immutable/);
      await expect(prisma.order.delete({ where: { id: order.order_id } })).rejects.toThrow();
    });

    it("applies free-shipping thresholds and drops a method that no longer fits", async () => {
      const p = await product("Chair", { price_minor: 6000 });
      const s = shop();
      await s.start();
      await s.post("/cart/lines", { variant_id: p.variant_id, quantity: 2 }).expect(201);
      await s.post("/checkout").expect(200);
      const v = (
        await s
          .patch("/checkout", { shipping_address: US, shipping_method_id: standard.id })
          .expect(200)
      ).body.data;
      expect(v.shipping_options.find((o: { id: string }) => o.id === standard.id)).toMatchObject({
        price_minor: 0,
        free: true,
      });
      // Express doesn't go to Canada: switching country clears it silently.
      await s.patch("/checkout", { shipping_method_id: express.id }).expect(200);
      const ca = (
        await s
          .patch("/checkout", {
            shipping_address: { ...US, country: "CA", region: "ON", postal_code: "M5V 1J1" },
          })
          .expect(200)
      ).body.data;
      expect(ca.shipping_method_id).toBeNull();
      expect(ca.missing).toContain("shipping_method");
    });

    it("holds the last unit for one shopper and releases it when the hold expires", async () => {
      const p = await product("Last one", { inventory_quantity: 1 });
      const a = shop();
      const b = shop();
      await a.start();
      await b.start();
      await a.post("/cart/lines", { variant_id: p.variant_id }).expect(201);
      await b.post("/cart/lines", { variant_id: p.variant_id }).expect(201);
      await a.post("/checkout").expect(200);
      // B can't hold it: the cart shows it sold out and checkout is blocked.
      const bv = (await b.post("/checkout").expect(200)).body.data;
      expect(bv.cart.lines[0].available).toBe(false);
      expect(bv.missing).toContain("items");
      const c = shop();
      await c.start();
      const sold = await c.post("/cart/lines", { variant_id: p.variant_id }).expect(422);
      expect(sold.body.error.code).toBe("INSUFFICIENT_STOCK");

      // A's hold lapses → the unit is free again.
      await prisma.inventoryReservation.updateMany({
        where: { variant_id: p.variant_id, status: "active" },
        data: { expires_at: new Date(Date.now() - 1000) },
      });
      await c.post("/cart/lines", { variant_id: p.variant_id }).expect(201);
      expect((await level(p.variant_id)).reserved).toBe(0);
      expect(
        await prisma.inventoryReservation.count({
          where: { variant_id: p.variant_id, status: "expired" },
        }),
      ).toBe(1);
    });

    it("never sells the same unit twice under concurrent completion", async () => {
      const p = await product("Contested", { inventory_quantity: 1 });
      const ready = async () => {
        const s = shop();
        await s.start();
        await s.post("/cart/lines", { variant_id: p.variant_id }).expect(201);
        await s.post("/checkout").expect(200);
        await s
          .patch("/checkout", {
            email: "race@example.com",
            shipping_address: US,
            shipping_method_id: standard.id,
            payment_method: "cod",
            custom_fields: { delivery: "Afternoon" },
            terms_accepted: true,
          })
          .expect(200);
        return s;
      };
      const a = await ready();
      // Second shopper prepared after A holds the unit; force A's hold to lapse so both compete.
      await prisma.inventoryReservation.updateMany({
        where: { variant_id: p.variant_id, status: "active" },
        data: { expires_at: new Date(Date.now() - 1000) },
      });
      const b = await ready();
      const results = await Promise.all([a.complete(`ra-${RUN}`), b.complete(`rb-${RUN}`)]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 422]);
      expect((await level(p.variant_id)).on_hand).toBe(0);
      expect(await prisma.orderItem.count({ where: { variant_id: p.variant_id } })).toBe(1);
    });

    it("places exactly one order when the same checkout is submitted twice at once", async () => {
      const p = await product("Double click");
      const s = shop();
      await s.start();
      await s.post("/cart/lines", { variant_id: p.variant_id }).expect(201);
      await s.post("/checkout").expect(200);
      const v = (
        await s
          .patch("/checkout", {
            email: "dup@example.com",
            shipping_address: US,
            shipping_method_id: standard.id,
            payment_method: "cod",
            custom_fields: { delivery: "Morning" },
            terms_accepted: true,
          })
          .expect(200)
      ).body.data;
      const [r1, r2] = await Promise.all([s.complete(`d1-${RUN}`), s.complete(`d2-${RUN}`)]);
      expect([r1.status, r2.status].filter((x) => x === 201)).toHaveLength(1);
      expect(await prisma.order.count({ where: { checkout_id: v.id } })).toBe(1);
    });

    it("sells untracked and oversell-allowed items without holds", async () => {
      const untracked = await product("Gift card", {
        inventory_tracking: false,
        inventory_quantity: undefined,
      });
      const oversell = await product("Made to order", {
        inventory_quantity: 0,
        continue_selling: true,
      });
      const s = shop();
      await s.start();
      await s.post("/cart/lines", { variant_id: untracked.variant_id, quantity: 5 }).expect(201);
      await s.post("/cart/lines", { variant_id: oversell.variant_id, quantity: 2 }).expect(201);
      await s.post("/checkout").expect(200);
      await s
        .patch("/checkout", {
          email: "made@example.com",
          shipping_address: US,
          shipping_method_id: standard.id,
          payment_method: "cod",
          custom_fields: { delivery: "Morning" },
          terms_accepted: true,
        })
        .expect(200);
      await s.complete(`u-${RUN}`).expect(201);
      expect((await level(oversell.variant_id)).on_hand).toBe(-2);
    });
  });
});
