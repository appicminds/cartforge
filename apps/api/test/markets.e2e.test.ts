import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { FX_HTTP } from "../src/commerce/markets/fx.service";
import type { PaymentHttp } from "../src/commerce/payments/provider";
import { api, createTestApp, login, RUN } from "./app";
import { TEST_ENV } from "./test-env";

/**
 * Markets: one PKR store also selling to the Gulf in AED — own or live rate,
 * rounding, fixed prices, products hidden per market, cart switching, checkout
 * countries and payment methods per market, orders valued in PKR.
 */
describe("markets", () => {
  let app: INestApplication;
  let owner: ReturnType<typeof api>;
  let storeId = "";
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  let suit: { id: string; handle: string; variant: string };
  let shawl: { id: string; handle: string; variant: string };
  let gulf: { id: string };
  let fxCalls = 0;
  const fx: PaymentHttp = {
    async request(url) {
      fxCalls++;
      expect(url).toContain("openexchangerates.org/api/latest.json?app_id=test-key");
      // 1 USD = 280 PKR = 3.6725 AED → 1 AED ≈ 76.24 PKR
      return {
        status: 200,
        text: JSON.stringify({ base: "USD", rates: { PKR: 280, AED: 3.6725, GBP: 0.79 } }),
      };
    },
  };

  const http = () => request(app.getHttpServer());
  const sf = (path: string) => `/api/v1/storefront${path}`;
  const newCart = async (market?: string) => {
    const r = http().post(sf("/cart")).set("X-Store-Id", storeId);
    if (market) r.set("X-Market", market);
    return (await r.expect(201)).body.data as { token: string; cart: { currency: string } };
  };
  const inCart = (token: string) => ({
    get: (p: string) => http().get(sf(p)).set("X-Store-Id", storeId).set("X-Cart-Token", token),
    post: (p: string, b: object = {}) =>
      http().post(sf(p)).set("X-Store-Id", storeId).set("X-Cart-Token", token).send(b),
    put: (p: string, b: object) =>
      http().put(sf(p)).set("X-Store-Id", storeId).set("X-Cart-Token", token).send(b),
    patch: (p: string, b: object) =>
      http().patch(sf(p)).set("X-Store-Id", storeId).set("X-Cart-Token", token).send(b),
  });

  beforeAll(async () => {
    process.env.FX_PROVIDER = "openexchangerates";
    process.env.FX_API_KEY = "test-key";
    app = await createTestApp([{ provide: FX_HTTP, useValue: fx }]);
    await prisma.fxRate.deleteMany({});
    const merchant = await login(app, "other@cartforge.test");
    const store = (
      await http()
        .post("/api/v1/stores")
        .set("Cookie", merchant.cookies)
        .set("X-CSRF-Token", merchant.csrf)
        .send({ store_name: `Silsila Markets ${RUN}`, currency: "PKR" })
        .expect(201)
    ).body.data;
    storeId = store.store_id;
    owner = api(app, merchant, storeId);
    const mk = async (title: string, price: number) => {
      const p = (
        await owner
          .post("/products", {
            title: `${title} ${RUN}`,
            price_minor: price,
            status: "active",
            inventory_quantity: 5,
          })
          .expect(201)
      ).body.data;
      return {
        id: p.id as string,
        handle: p.handle as string,
        variant: p.variants[0].id as string,
      };
    };
    suit = await mk("Lawn Suit", 4799);
    shawl = await mk("Pashmina Shawl", 9000);
    await owner
      .post("/shipping-methods", { name: "Courier", price_minor: 250, countries: [] })
      .expect(201);
    const settings = (await owner.get("/settings/checkout").expect(200)).body.data;
    await owner
      .put("/settings/checkout", {
        ...settings,
        cod_enabled: true,
        wallet_enabled: true,
        wallet_jazzcash: "03001234567",
        wallet_account_title: "Silsila",
      })
      .expect(200);
  });

  afterAll(async () => {
    delete process.env.FX_PROVIDER;
    delete process.env.FX_API_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  it("starts with a primary market in the store currency; validates new markets", async () => {
    const o = (await owner.get("/markets").expect(200)).body.data;
    expect(o).toMatchObject({ store_currency: "PKR", live_rates_available: true });
    expect(o.markets).toEqual([
      expect.objectContaining({
        name: "Pakistan",
        currency: "PKR",
        countries: ["PK"],
        is_primary: true,
      }),
    ]);
    const bad = await owner
      .post("/markets", {
        name: "Gulf",
        currency: "AED",
        countries: ["PK"],
        manual_rate: null,
        payment_methods: ["wallet_transfer"],
      })
      .expect(422);
    const paths = bad.body.error.fields.map((f: { path: string }) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["manual_rate", "payment_methods", "countries"]));
    // The primary market keeps the store currency.
    const primary = o.markets[0];
    await owner
      .put(`/markets/${primary.id}`, { name: "Pakistan", currency: "USD", countries: ["PK"] })
      .expect(422);
    await owner.delete(`/markets/${primary.id}`).expect(409);
  });

  it("prices in AED: own rate, adjustment, rounding and fixed prices", async () => {
    gulf = (
      await owner
        .post("/markets", {
          name: "Gulf",
          currency: "AED",
          countries: ["AE", "SA"],
          pricing_mode: "manual",
          manual_rate: 76, // 1 AED = 76 PKR
          rounding: "x99",
          payment_methods: ["cod", "stripe"],
        })
        .expect(201)
    ).body.data;
    expect(gulf).toMatchObject({ rate: 76, rate_source: "manual" });

    const list = async (market?: string) =>
      (
        await http()
          .get(sf(`/products?q=${RUN}${market ? `&market=${market}` : ""}`))
          .set("X-Store-Id", storeId)
          .expect(200)
      ).body.data as { handle: string; currency: string; price_min_minor: number }[];
    const pk = await list();
    expect(pk.find((p) => p.handle === suit.handle)).toMatchObject({
      currency: "PKR",
      price_min_minor: 4799,
    });
    // Rs 4,799 / 76 = AED 63.14 → rounded up to 63.99
    const ae = await list(gulf.id);
    expect(ae.find((p) => p.handle === suit.handle)).toMatchObject({
      currency: "AED",
      price_min_minor: 6399,
    });
    expect(ae.find((p) => p.handle === shawl.handle)?.price_min_minor).toBe(11899); // 118.42 → 118.99

    // A fixed AED price for the shawl; the shawl isn't sold... yet hidden below.
    await owner
      .put(`/products/${shawl.id}/markets`, {
        hidden_market_ids: [],
        prices: [{ market_id: gulf.id, variant_id: shawl.variant, price_minor: 9900 }],
      })
      .expect(200);
    expect((await list(gulf.id)).find((p) => p.handle === shawl.handle)?.price_min_minor).toBe(
      9900,
    );
    // Clearing it goes back to the converted price.
    const pm = (
      await owner
        .put(`/products/${shawl.id}/markets`, {
          hidden_market_ids: [],
          prices: [{ market_id: gulf.id, variant_id: shawl.variant, price_minor: null }],
        })
        .expect(200)
    ).body.data;
    const gulfRows = pm.markets.find((m: { id: string }) => m.id === gulf.id).rows;
    expect(gulfRows[0]).toMatchObject({ converted_minor: 11899, price_minor: null });
  });

  it("hides a product from one market only", async () => {
    await owner
      .put(`/products/${shawl.id}/markets`, { hidden_market_ids: [gulf.id], prices: [] })
      .expect(200);
    const ae = (
      await http()
        .get(sf(`/products?q=${RUN}&market=${gulf.id}`))
        .set("X-Store-Id", storeId)
        .expect(200)
    ).body.data.map((p: { handle: string }) => p.handle);
    expect(ae).toEqual([suit.handle]);
    const direct = (
      await http()
        .get(sf(`/products/${shawl.handle}?market=${gulf.id}`))
        .set("X-Store-Id", storeId)
        .expect(200)
    ).body.data;
    expect(direct.market_available).toBe(false);
    const pk = (
      await http()
        .get(sf(`/products/${shawl.handle}`))
        .set("X-Store-Id", storeId)
        .expect(200)
    ).body.data;
    expect(pk.market_available).toBe(true);
    // The primary market can't be excluded.
    const o = (await owner.get("/markets").expect(200)).body.data;
    await owner
      .put(`/products/${shawl.id}/markets`, { hidden_market_ids: [o.markets[0].id] })
      .expect(422);
  });

  it("carts price in the market and re-price when the shopper switches", async () => {
    const { token, cart } = await newCart(gulf.id);
    expect(cart.currency).toBe("AED");
    const c = inCart(token);
    await c.post("/cart/lines", { variant_id: shawl.variant, quantity: 1 }).expect(422); // hidden
    const v = (await c.post("/cart/lines", { variant_id: suit.variant, quantity: 2 }).expect(201))
      .body.data;
    expect(v).toMatchObject({ currency: "AED", subtotal_minor: 12798 });
    // Switch to Pakistan: same items, rupee prices, no "price changed" notices.
    const pk = (await c.put("/cart/market", { market_id: "primary" }).expect(200)).body.data;
    expect(pk).toMatchObject({ currency: "PKR", subtotal_minor: 9598, notices: [] });
    // Back to the Gulf: the hidden shawl added in Pakistan is removed with a reason.
    await c.post("/cart/lines", { variant_id: shawl.variant, quantity: 1 }).expect(201);
    const back = (await c.put("/cart/market", { market_id: gulf.id }).expect(200)).body.data;
    expect(back.currency).toBe("AED");
    expect(back.lines).toHaveLength(1);
    expect(back.notices[0].message).toMatch(/isn't sold in your country/);
  });

  it("checks out in AED: market countries and payment methods; order valued in PKR", async () => {
    const { token } = await newCart(gulf.id);
    const c = inCart(token);
    await c.post("/cart/lines", { variant_id: suit.variant, quantity: 1 }).expect(201);
    const open = (await c.post("/checkout").expect(200)).body.data;
    expect(open.shipping_countries).toEqual(["AE", "SA"]);
    // COD allowed; wallet transfer is rupees-only and not listed for this market anyway.
    expect(open.payment_options.map((p: { key: string }) => p.key)).toEqual(["cod"]);
    await c
      .patch("/checkout", {
        shipping_address: {
          first_name: "Sara",
          last_name: "Ali",
          address1: "1 Marina Walk",
          city: "Dubai",
          region: "Dubai",
          postal_code: "00000",
          country: "PK",
        },
      })
      .expect(422); // Pakistan belongs to the other market
    const v = (
      await c
        .patch("/checkout", {
          email: `sara-${RUN}@example.com`,
          shipping_address: {
            first_name: "Sara",
            last_name: "Ali",
            address1: "1 Marina Walk",
            city: "Dubai",
            region: "Dubai",
            postal_code: "00000",
            country: "AE",
          },
          payment_method: "wallet_transfer",
        })
        .expect(422)
    ).body;
    expect(v.error.fields[0].path).toBe("payment_method");
    const ready = (
      await c
        .patch("/checkout", {
          email: `sara-${RUN}@example.com`,
          shipping_address: {
            first_name: "Sara",
            last_name: "Ali",
            address1: "1 Marina Walk",
            city: "Dubai",
            region: "Dubai",
            postal_code: "00000",
            country: "AE",
          },
          payment_method: "cod",
        })
        .expect(200)
    ).body.data;
    // Shipping Rs 250 → AED 3.29 (exact, not price-rounded).
    expect(ready.shipping_options[0]).toMatchObject({ price_minor: 329 });
    const withShip = (
      await c.patch("/checkout", { shipping_method_id: ready.shipping_options[0].id }).expect(200)
    ).body.data;
    expect(withShip.totals).toMatchObject({ total_minor: 6399 + 329 });
    const placed = (
      await c.post("/checkout/complete").set("Idempotency-Key", `mk-${RUN}`).expect(201)
    ).body.data;
    const order = await prisma.order.findUniqueOrThrow({ where: { id: placed.order_id } });
    expect(order).toMatchObject({ currency: "AED", market_id: gulf.id, store_currency: "PKR" });
    expect(Number(order.fx_rate)).toBe(76);
    expect(Number(order.store_total_minor)).toBe(Math.round(67.28 * 76)); // Rs 5,113
    // Customers are valued in rupees.
    const customers = (await owner.get(`/customers?q=sara-${RUN}`).expect(200)).body.data;
    expect(customers[0]).toMatchObject({ orders_count: 1 });
  });

  it("uses live rates when chosen, refreshing them from the provider", async () => {
    const uk = (
      await owner
        .post("/markets", {
          name: "UK",
          currency: "GBP",
          countries: ["GB"],
          pricing_mode: "live",
          rounding: "x99",
          adjustment_bps: 1000,
        })
        .expect(201)
    ).body.data;
    expect(uk.rate_source).toBe("live");
    expect(fxCalls).toBe(1);
    // Rs 4,799 × (0.79/280) = £13.54, +10% = £14.89 → £14.99
    const p = (
      await http()
        .get(sf(`/products/${suit.handle}?market=${uk.id}`))
        .set("X-Store-Id", storeId)
        .expect(200)
    ).body.data;
    expect(p).toMatchObject({ currency: "GBP", price_min_minor: 1499 });
    expect(fxCalls).toBe(1); // cached, not fetched again
    // Storefront lists every active market.
    const markets = (await http().get(sf("/markets")).set("X-Store-Id", storeId).expect(200)).body
      .data;
    expect(markets.map((m: { currency: string }) => m.currency)).toEqual(["PKR", "AED", "GBP"]);
  });
});
