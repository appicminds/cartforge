import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_STORES } from "@cartforge/database/seed";
import { api, createTestApp, login, RUN, type Session } from "./app";

/** Next 7 — customers: created by orders, stats, search, staff edits, permissions. */
describe("customers (Next 7)", () => {
  let app: INestApplication;
  let admin: Session;
  let storeId: string;
  let owner: ReturnType<typeof api>;
  let shipId: string;
  let variant: string;
  const http = () => request(app.getHttpServer());
  const mail = (tag: string) => `${tag}-${RUN}@example.com`.toLowerCase();

  const place = async (email: string, first: string, method = "cod") => {
    const cart = await http()
      .post("/api/v1/storefront/cart")
      .set("X-Store-Id", storeId)
      .expect(201);
    const token = cart.body.data.token as string;
    const sf = (m: "post" | "patch", p: string) =>
      http()[m](`/api/v1/storefront${p}`).set("X-Store-Id", storeId).set("X-Cart-Token", token);
    await sf("post", "/cart/lines").send({ variant_id: variant, quantity: 1 }).expect(201);
    await sf("post", "/checkout").expect(200);
    await sf("patch", "/checkout")
      .send({
        email,
        phone: "+923001112233",
        shipping_address: {
          first_name: first,
          last_name: "Raza",
          address1: "5 Canal View",
          city: "Lahore",
          postal_code: "54000",
          country: "PK",
        },
        shipping_method_id: shipId,
        payment_method: method,
      })
      .expect(200);
    const done = await sf("post", "/checkout/complete")
      .set("Idempotency-Key", `c-${RUN}-${Math.random()}`)
      .send({})
      .expect(201);
    return done.body.data.order_id as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
    admin = await login(app, "platform@cartforge.test");
    storeId = (
      await http()
        .post("/api/v1/stores")
        .set("Cookie", admin.cookies)
        .set("X-CSRF-Token", admin.csrf)
        .send({ store_name: `Customers Lab ${RUN}`, currency: "PKR" })
        .expect(201)
    ).body.data.store_id;
    owner = api(app, admin, storeId);
    await owner
      .put("/settings/checkout", {
        tax_rate_bps: 0,
        prices_include_tax: false,
        tax_shipping: false,
        phone: "optional",
        reservation_minutes: 15,
        terms_required: false,
        custom_fields: [],
        cod_enabled: true,
        cod_instructions: "",
        bank_transfer_enabled: false,
        bank_transfer_instructions: "",
      })
      .expect(200);
    shipId = (
      await owner
        .post("/shipping-methods", { name: "TCS", price_minor: 200, countries: [] })
        .expect(201)
    ).body.data.id;
    variant = (
      await owner
        .post("/products", {
          title: `Shawl ${RUN}`,
          price_minor: 3000,
          status: "active",
          inventory_quantity: 50,
        })
        .expect(201)
    ).body.data.variants[0].id;
  });
  afterAll(() => app.close());

  it("every order belongs to a customer, matched by email, guest or not", async () => {
    const a = await place(mail("sana").toUpperCase(), "Sana");
    const b = await place(mail("sana"), "Sana");
    await place(mail("bilal"), "Bilal");
    const list = (await owner.get("/customers").expect(200)).body.data;
    expect(list.map((c: { email: string }) => c.email).sort()).toEqual([
      mail("bilal"),
      mail("sana"),
    ]);
    const sana = list.find((c: { email: string }) => c.email === mail("sana"));
    expect(sana).toMatchObject({
      name: "Sana Raza",
      phone: "+923001112233",
      has_account: false,
      orders_count: 2,
      total_spent_minor: 0, // nothing paid yet
      currency: "PKR",
    });
    // Spending counts paid money minus refunds, and leaves canceled orders out.
    await owner.post(`/orders/${a}/mark-paid`, {}).expect(200);
    await owner.post(`/orders/${b}/mark-paid`, {}).expect(200);
    await owner
      .post(`/orders/${b}/refunds`, { amount_minor: 1000, notify_customer: false })
      .expect(201);
    const detail = (await owner.get(`/customers/${sana.id}`).expect(200)).body.data;
    expect(detail.total_spent_minor).toBe(3200 + 3200 - 1000);
    expect(detail.orders.map((o: { id: string }) => o.id).sort()).toEqual([a, b].sort());
    const only = (await owner.get(`/orders?customer_id=${sana.id}`).expect(200)).body.meta.total;
    expect(only).toBe(2);
  });

  it("searches and sorts customers, and staff can add notes and tags", async () => {
    const sana = (await owner.get(`/customers?q=${encodeURIComponent("sana")}`).expect(200)).body
      .data;
    expect(sana).toHaveLength(1);
    expect((await owner.get("/customers?q=3001112233").expect(200)).body.meta.total).toBe(2);
    const bySpent = (await owner.get("/customers?sort=total_spent").expect(200)).body.data;
    expect(bySpent[0].email).toBe(mail("sana"));

    const updated = (
      await owner
        .patch(`/customers/${sana[0].id}`, {
          note: "Prefers WhatsApp",
          tags: ["vip", "lahore", "vip"],
          accepts_marketing: true,
        })
        .expect(200)
    ).body.data;
    expect(updated).toMatchObject({
      note: "Prefers WhatsApp",
      tags: ["vip", "lahore"],
      accepts_marketing: true,
    });
    expect(
      (await owner.get("/customers?q=vip").expect(200)).body.data.map((c: { id: string }) => c.id),
    ).toEqual([sana[0].id]);
    await owner.patch(`/customers/${sana[0].id}`, { unknown: 1 }).expect(422);
  });

  it("respects permissions and store boundaries", async () => {
    const id = (await owner.get("/customers").expect(200)).body.data[0].id;
    const main = SEED_STORES.main.id;
    const catalog = api(app, await login(app, "catalog@cartforge.test"), main);
    await catalog.get("/customers").expect(403);
    const orders = api(app, await login(app, "orders@cartforge.test"), main);
    await orders.get("/customers").expect(200);
    await orders.patch(`/customers/${id}`, { note: "x" }).expect(403);
    // Another store's staff can't see this store's customer.
    const stranger = api(app, await login(app, "owner@cartforge.test"), main);
    await stranger.get(`/customers/${id}`).expect(404);
  });
});
