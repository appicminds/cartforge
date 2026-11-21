import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { Mailer, type Email } from "../src/mail/mailer";
import { api, createTestApp, login, RUN, type Session } from "./app";
import { TEST_ENV } from "./test-env";

const ADDRESS = {
  first_name: "Ada",
  last_name: "Lovelace",
  address1: "1 Analytical Way",
  city: "Springfield",
  region: "IL",
  postal_code: "62701",
  country: "US",
};

/**
 * Next 6 — order processing: payment received, shipping (partial, tracking),
 * delivery, cancellation with restock, refunds, notes, statuses and emails.
 */
describe("order processing (Next 6)", () => {
  let app: INestApplication;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  const sent: Email[] = [];
  let admin: Session;
  let storeId: string;
  let owner: ReturnType<typeof api>;
  let shippingId: string;
  let mug: { id: string; variant_id: string };
  let tee: { id: string; variant_id: string };

  const onHand = async (variantId: string) =>
    (await prisma.inventoryLevel.findFirstOrThrow({ where: { variant_id: variantId } })).on_hand;

  /** Places an order through the real storefront checkout; returns its id. */
  const place = async (
    lines: { variant_id: string; quantity: number }[],
    method = "bank_transfer",
  ) => {
    const http = () => request(app.getHttpServer());
    const cart = await http()
      .post("/api/v1/storefront/cart")
      .set("X-Store-Id", storeId)
      .expect(201);
    const token = cart.body.data.token as string;
    const sf = (m: "post" | "patch", p: string) =>
      http()[m](`/api/v1/storefront${p}`).set("X-Store-Id", storeId).set("X-Cart-Token", token);
    for (const l of lines) await sf("post", "/cart/lines").send(l).expect(201);
    await sf("post", "/checkout").expect(200);
    await sf("patch", "/checkout")
      .send({
        email: `buyer-${RUN}@example.com`,
        shipping_address: ADDRESS,
        shipping_method_id: shippingId,
        payment_method: method,
      })
      .expect(200);
    const done = await sf("post", "/checkout/complete")
      .set("Idempotency-Key", `k-${RUN}-${Math.random()}`)
      .send({})
      .expect(201);
    return done.body.data.order_id as string;
  };
  const detail = async (id: string) => (await owner.get(`/orders/${id}`).expect(200)).body.data;

  beforeAll(async () => {
    app = await createTestApp([
      {
        provide: Mailer,
        useValue: { enabled: true, send: async (e: Email) => (sent.push(e), true) },
      },
    ]);
    admin = await login(app, "platform@cartforge.test");
    const store = await request(app.getHttpServer())
      .post("/api/v1/stores")
      .set("Cookie", admin.cookies)
      .set("X-CSRF-Token", admin.csrf)
      .send({ store_name: `Orders Lab ${RUN}`, currency: "USD" })
      .expect(201);
    storeId = store.body.data.store_id;
    await prisma.store.update({
      where: { id: storeId },
      data: { contact_email: `shop-${RUN}@example.com` },
    });
    owner = api(app, admin, storeId);
    await owner
      .put("/settings/checkout", {
        tax_rate_bps: 0,
        prices_include_tax: false,
        tax_shipping: false,
        phone: "hidden",
        reservation_minutes: 15,
        terms_required: false,
        custom_fields: [],
        cod_enabled: true,
        cod_instructions: "Cash on delivery.",
        bank_transfer_enabled: true,
        bank_transfer_instructions: "IBAN XX00 0000",
      })
      .expect(200);
    shippingId = (
      await owner
        .post("/shipping-methods", { name: "Standard", price_minor: 500, countries: [] })
        .expect(201)
    ).body.data.id;
    const mk = async (title: string, price: number) => {
      const p = (
        await owner
          .post("/products", {
            title: `${title} ${RUN}`,
            price_minor: price,
            status: "active",
            inventory_quantity: 20,
          })
          .expect(201)
      ).body.data;
      return { id: p.id as string, variant_id: p.variants[0].id as string };
    };
    mug = await mk("Mug", 1500);
    tee = await mk("Tee", 3000);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("emails the customer a receipt with their status link, and tells the store", async () => {
    sent.length = 0;
    const id = await place([{ variant_id: mug.variant_id, quantity: 1 }]);
    const receipt = sent.find((e) => e.to === `buyer-${RUN}@example.com`)!;
    expect(receipt.subject).toMatch(/^Order \d+ confirmed/);
    expect(receipt.text).toContain("IBAN XX00 0000");
    expect(receipt.text).toMatch(new RegExp(`/orders/${id}\\?key=`));
    expect(receipt.replyTo).toBe(`shop-${RUN}@example.com`);
    const store = sent.find((e) => e.to === `shop-${RUN}@example.com`)!;
    expect(store.subject).toMatch(/^New order \d+ — \$20\.00$/);
    const o = await detail(id);
    expect(o.events.filter((e: { type: string }) => e.type === "email")).toHaveLength(2);
  });

  it("records payment, ships in parts with tracking, and completes", async () => {
    const id = await place([
      { variant_id: mug.variant_id, quantity: 2 },
      { variant_id: tee.variant_id, quantity: 1 },
    ]);
    let o = await detail(id);
    expect(o).toMatchObject({
      status: "pending",
      payment_status: "pending",
      fulfillment_status: "unfulfilled",
    });
    const [mugLine, teeLine] = o.lines;

    o = (await owner.post(`/orders/${id}/mark-paid`, { reference: "BANK-42" }).expect(200)).body
      .data;
    expect(o).toMatchObject({ status: "processing", payment_status: "paid" });
    expect(o.payments[0].status).toBe("paid");
    await owner.post(`/orders/${id}/mark-paid`, {}).expect(409);

    sent.length = 0;
    const tooMany = await owner
      .post(`/orders/${id}/fulfillments`, { items: [{ order_item_id: mugLine.id, quantity: 3 }] })
      .expect(422);
    expect(tooMany.body.error.fields[0].path).toBe("items.0.quantity");
    o = (
      await owner
        .post(`/orders/${id}/fulfillments`, {
          items: [{ order_item_id: mugLine.id, quantity: 1 }],
          tracking_company: "DHL",
          tracking_number: "JD0001",
          tracking_url: "https://track.example/JD0001",
        })
        .expect(201)
    ).body.data;
    expect(o.fulfillment_status).toBe("partially_fulfilled");
    expect(o.status).toBe("processing");
    expect(o.fulfillments[0]).toMatchObject({
      tracking_number: "JD0001",
      items: [{ quantity: 1 }],
    });
    const shipped = sent.find((e) => e.subject.includes("is on its way"))!;
    expect(shipped.text).toContain("DHL JD0001");
    expect(shipped.text).toContain("https://track.example/JD0001");

    // The rest, no tracking, no email.
    sent.length = 0;
    o = (await owner.post(`/orders/${id}/fulfillments`, { notify_customer: false }).expect(201))
      .body.data;
    expect(sent).toHaveLength(0);
    expect(o).toMatchObject({ status: "completed", fulfillment_status: "fulfilled" });
    expect(o.line_progress).toEqual([
      { order_item_id: mugLine.id, fulfilled: 2, refunded: 0 },
      { order_item_id: teeLine.id, fulfilled: 1, refunded: 0 },
    ]);
    await owner.post(`/orders/${id}/fulfillments`, {}).expect(409);

    const fid = o.fulfillments[1].id;
    o = (await owner.post(`/orders/${id}/fulfillments/${fid}/delivered`).expect(200)).body.data;
    expect(o.fulfillments[1].delivered_at).toEqual(expect.any(String));
    await owner.post(`/orders/${id}/fulfillments/${fid}/delivered`).expect(409);
    // Shipped orders can't be canceled.
    await owner.post(`/orders/${id}/cancel`, { reason: "customer" }).expect(409);
  });

  it("cancels an unpaid order, voids the payment and puts stock back", async () => {
    const before = await onHand(tee.variant_id);
    const id = await place([{ variant_id: tee.variant_id, quantity: 2 }], "cod");
    expect(await onHand(tee.variant_id)).toBe(before - 2);
    sent.length = 0;
    const o = (await owner.post(`/orders/${id}/cancel`, { reason: "customer" }).expect(200)).body
      .data;
    expect(o).toMatchObject({
      status: "canceled",
      payment_status: "voided",
      cancel_reason: "customer",
    });
    expect(o.canceled_at).toEqual(expect.any(String));
    expect(await onHand(tee.variant_id)).toBe(before);
    expect(sent.map((e) => e.subject)).toEqual([expect.stringMatching(/canceled$/)]);
    await owner.post(`/orders/${id}/cancel`, { reason: "customer" }).expect(409);
    await owner.post(`/orders/${id}/mark-paid`, {}).expect(409);
    await owner.post(`/orders/${id}/fulfillments`, {}).expect(409);
  });

  it("a paid order is canceled only together with a refund", async () => {
    const before = await onHand(mug.variant_id);
    const id = await place([{ variant_id: mug.variant_id, quantity: 1 }]);
    await owner.post(`/orders/${id}/mark-paid`, {}).expect(200);
    const blocked = await owner.post(`/orders/${id}/cancel`, { reason: "inventory" }).expect(409);
    expect(blocked.body.error.code).toBe("ORDER_PAID");
    const o = (
      await owner
        .post(`/orders/${id}/cancel`, { reason: "inventory", refund: true, notify_customer: false })
        .expect(200)
    ).body.data;
    expect(o).toMatchObject({
      status: "canceled",
      payment_status: "refunded",
      refunded_minor: 2000,
    });
    expect(o.refunds[0]).toMatchObject({
      amount_minor: 2000,
      items: [{ quantity: 1, restocked: true }],
    });
    expect(await onHand(mug.variant_id)).toBe(before);
  });

  it("refunds part of an order, restocking what came back, never more than paid", async () => {
    const before = await onHand(mug.variant_id);
    const id = await place([
      { variant_id: mug.variant_id, quantity: 2 },
      { variant_id: tee.variant_id, quantity: 1 },
    ]); // 3000 + 3000 + 500 shipping = 6500
    let o = await detail(id);
    const mugLine = o.lines[0];
    await owner.post(`/orders/${id}/refunds`, { amount_minor: 100 }).expect(409); // unpaid
    await owner.post(`/orders/${id}/mark-paid`, {}).expect(200);
    await owner.post(`/orders/${id}/fulfillments`, { notify_customer: false }).expect(201);

    sent.length = 0;
    o = (
      await owner
        .post(`/orders/${id}/refunds`, {
          items: [{ order_item_id: mugLine.id, quantity: 1, restock: true }],
          amount_minor: 1500,
          reason: "Chipped",
        })
        .expect(201)
    ).body.data;
    expect(o).toMatchObject({
      payment_status: "partially_refunded",
      status: "completed",
      refunded_minor: 1500,
    });
    expect(await onHand(mug.variant_id)).toBe(before - 1);
    expect(sent[0]!.text).toContain("$15.00");
    expect(o.events.at(-2).message).toMatch(/^Refunded \$15\.00 for 1 item — Chipped$/);

    const tooMuch = await owner.post(`/orders/${id}/refunds`, { amount_minor: 5001 }).expect(422);
    expect(tooMuch.body.error.code).toBe("REFUND_TOO_HIGH");
    await owner
      .post(`/orders/${id}/refunds`, {
        items: [{ order_item_id: mugLine.id, quantity: 2 }],
        amount_minor: 0,
      })
      .expect(422);
    o = (
      await owner
        .post(`/orders/${id}/refunds`, { amount_minor: 5000, notify_customer: false })
        .expect(201)
    ).body.data;
    expect(o).toMatchObject({
      status: "refunded",
      payment_status: "refunded",
      refunded_minor: 6500,
    });
    // Refunds are permanent records.
    await expect(prisma.refund.deleteMany({ where: { order_id: id } })).rejects.toThrow(
      /append-only/,
    );
  });

  it("keeps notes, and respects permissions and store boundaries", async () => {
    const id = await place([{ variant_id: mug.variant_id, quantity: 1 }]);
    const o = (await owner.post(`/orders/${id}/notes`, { message: "Gift wrap please" }).expect(201))
      .body.data;
    expect(o.events.at(-1)).toMatchObject({
      type: "note",
      message: "Gift wrap please",
      actor: expect.any(String),
    });
    await owner.post(`/orders/${id}/notes`, { message: "  " }).expect(422);

    // Another store's staff can't see or touch it.
    const stranger = api(
      app,
      await login(app, "owner@cartforge.test"),
      "00000000-0000-4000-8000-000000000001",
    );
    await stranger.post(`/orders/${id}/mark-paid`, {}).expect(404);
    await stranger.post(`/orders/${id}/notes`, { message: "hi" }).expect(404);
  });

  it("lists the orders that still need shipping", async () => {
    const open = await place([{ variant_id: mug.variant_id, quantity: 1 }]);
    const shipped = await place([{ variant_id: mug.variant_id, quantity: 1 }]);
    await owner.post(`/orders/${shipped}/fulfillments`, { notify_customer: false }).expect(201);
    const canceled = await place([{ variant_id: mug.variant_id, quantity: 1 }]);
    await owner
      .post(`/orders/${canceled}/cancel`, { reason: "other", notify_customer: false })
      .expect(200);
    const ids = (await owner.get("/orders?to_ship=true&page_size=100").expect(200)).body.data.map(
      (o: { id: string }) => o.id,
    );
    expect(ids).toContain(open);
    expect(ids).not.toContain(shipped);
    expect(ids).not.toContain(canceled);
  });
});
