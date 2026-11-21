import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createTestApp, login, RUN, type Session } from "./app";

/**
 * Platform admin: switch a store's currency before its first order, keeping the
 * prices people see (4,799.00 USD → Rs 4,799), not converting at a rate.
 */
describe("platform: change a store's currency", () => {
  let app: INestApplication;
  let platform: Session;
  let merchant: Session;
  let store: { store_id: string };

  const change = (id: string, currency: string, as: Session = platform) =>
    request(app.getHttpServer())
      .post(`/api/v1/platform/stores/${id}/currency`)
      .set("Cookie", as.cookies)
      .set("X-CSRF-Token", as.csrf)
      .send({ currency });

  beforeAll(async () => {
    app = await createTestApp();
    platform = await login(app, "platform@cartforge.test");
    merchant = await login(app, "other@cartforge.test");
    store = (
      await request(app.getHttpServer())
        .post("/api/v1/stores")
        .set("Cookie", merchant.cookies)
        .set("X-CSRF-Token", merchant.csrf)
        .send({ store_name: `Rupee Switch ${RUN}`, currency: "USD" })
        .expect(201)
    ).body.data;
  });

  afterAll(async () => {
    await app.close();
  });

  it("keeps the shown prices, re-stores amounts, empties carts, refuses after orders", async () => {
    const m = api(app, merchant, store.store_id);
    const p = (
      await m
        .post("/products", {
          title: `Kurta ${RUN}`,
          status: "active",
          price_minor: 479900, // "4,799.00"
          compare_at_minor: 550050, // "5,500.50" → rounds to 5,501
          inventory_quantity: 3,
        })
        .expect(201)
    ).body.data;
    const ship = (
      await m
        .post("/shipping-methods", {
          name: "Nationwide",
          price_minor: 25000,
          free_over_minor: 500000,
          per_item_minor: 5000,
          countries: ["PK"],
        })
        .expect(201)
    ).body.data;
    const cart = await request(app.getHttpServer())
      .post("/api/v1/storefront/cart")
      .set("X-Store-Id", store.store_id)
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/v1/storefront/cart/lines")
      .set("X-Store-Id", store.store_id)
      .set("X-Cart-Token", cart.body.data.token)
      .send({ variant_id: p.variants[0].id, quantity: 1 })
      .expect(201);

    // Only platform admins; unknown or unchanged currencies are refused.
    await change(store.store_id, "PKR", merchant).expect(403);
    await change(store.store_id, "XYZ").expect(422);
    await change(store.store_id, "USD").expect(422);

    const r = (await change(store.store_id, "pkr").expect(200)).body.data;
    expect(r).toMatchObject({
      from: "USD",
      to: "PKR",
      variants: 1,
      shipping_methods: 1,
      rounded: 1,
      carts_cleared: 1,
    });
    const after = (await m.get(`/products/${p.id}`).expect(200)).body.data;
    expect(after.variants[0]).toMatchObject({ price_minor: 4799, compare_at_minor: 5501 });
    const methods = (await m.get("/shipping-methods").expect(200)).body.data;
    expect(methods.find((x: { id: string }) => x.id === ship.id)).toMatchObject({
      price_minor: 250,
      free_over_minor: 5000,
      per_item_minor: 50,
    });
    const info = (
      await request(app.getHttpServer())
        .get("/api/v1/storefront/store")
        .set("X-Store-Id", store.store_id)
        .expect(200)
    ).body.data;
    expect(info.currency).toBe("PKR");
    // The old cart is gone.
    await request(app.getHttpServer())
      .get("/api/v1/storefront/cart")
      .set("X-Store-Id", store.store_id)
      .set("X-Cart-Token", cart.body.data.token)
      .expect(404);

    // Once there's an order, the currency is fixed.
    await m
      .put("/settings/checkout", {
        ...(await m.get("/settings/checkout").expect(200)).body.data,
        cod_enabled: true,
      })
      .expect(200);
    const c2 = (
      await request(app.getHttpServer())
        .post("/api/v1/storefront/cart")
        .set("X-Store-Id", store.store_id)
        .expect(201)
    ).body.data.token;
    const sf = (method: "post" | "patch", path: string, body: object = {}) => {
      const agent = request(app.getHttpServer());
      const r =
        method === "post"
          ? agent.post(`/api/v1/storefront${path}`)
          : agent.patch(`/api/v1/storefront${path}`);
      return r.set("X-Store-Id", store.store_id).set("X-Cart-Token", c2).send(body);
    };
    await sf("post", "/cart/lines", { variant_id: p.variants[0].id, quantity: 1 }).expect(201);
    await sf("post", "/checkout").expect(200);
    const v = (
      await sf("patch", "/checkout", {
        email: `rupee-${RUN}@example.com`,
        shipping_address: {
          first_name: "Ali",
          last_name: "Raza",
          address1: "1 Mall Road",
          city: "Lahore",
          region: "Punjab",
          postal_code: "54000",
          country: "PK",
        },
        shipping_method_id: ship.id,
        payment_method: "cod",
      }).expect(200)
    ).body.data;
    expect(v.totals.total_minor).toBe(4799 + 250);
    await sf("post", "/checkout/complete").set("Idempotency-Key", `rupee-${RUN}`).expect(201);
    const refused = await change(store.store_id, "USD").expect(409);
    expect(refused.body.error.code).toBe("STORE_HAS_ORDERS");
  });
});
