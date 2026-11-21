import { createDecipheriv, createHmac } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { jazzcashHash } from "../src/commerce/payments/providers/jazzcash";
import { safepaySignature } from "../src/commerce/payments/providers/safepay";
import { PAYMENT_HTTP, type PaymentHttp } from "../src/commerce/payments/provider";
import { Mailer, type Email } from "../src/mail/mailer";
import { api, createTestApp, login, RUN, type Session } from "./app";
import { TEST_ENV } from "./test-env";

const ADDRESS = {
  first_name: "Ayesha",
  last_name: "Khan",
  address1: "12 Mall Road",
  city: "Lahore",
  postal_code: "54000",
  country: "PK",
};

/** A stand-in for every payment gateway: records calls, answers like the real APIs. */
class FakeGateway implements PaymentHttp {
  calls: { url: string; method: string; headers: Record<string, string>; body: string }[] = [];
  answer: (url: string, body: string) => { status: number; text: string } = () => ({
    status: 500,
    text: "{}",
  });
  async request(
    url: string,
    init: { method: "GET" | "POST"; headers?: Record<string, string>; body?: string },
  ) {
    this.calls.push({
      url,
      method: init.method,
      headers: init.headers ?? {},
      body: init.body ?? "",
    });
    return this.answer(url, init.body ?? "");
  }
}

const stripeSig = (body: string, secret: string, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

/**
 * Next 5 — Payment Hub: connecting providers, paying on the provider's page,
 * verified returns and webhooks, idempotency, provider refunds.
 */
describe("payment hub (Next 5)", () => {
  let app: INestApplication;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  const gateway = new FakeGateway();
  const sent: Email[] = [];
  let admin: Session;
  const http = () => request(app.getHttpServer());

  /** A fresh store (currency of choice) with one product and flat shipping. */
  const makeStore = async (currency: string) => {
    const store = (
      await http()
        .post("/api/v1/stores")
        .set("Cookie", admin.cookies)
        .set("X-CSRF-Token", admin.csrf)
        .send({ store_name: `Pay ${currency} ${RUN}`, currency })
        .expect(201)
    ).body.data;
    const owner = api(app, admin, store.store_id);
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
    const ship = (
      await owner
        .post("/shipping-methods", { name: "Courier", price_minor: 25000, countries: [] })
        .expect(201)
    ).body.data;
    const product = (
      await owner
        .post("/products", {
          title: `Kurta ${RUN}`,
          price_minor: 350000,
          status: "active",
          inventory_quantity: 50,
        })
        .expect(201)
    ).body.data;
    return {
      id: store.store_id as string,
      owner,
      shipId: ship.id as string,
      variant: product.variants[0].id as string,
    };
  };

  /** Checkout with the given method; returns the order id and its private key. */
  const placeOrder = async (s: { id: string; shipId: string; variant: string }, method: string) => {
    const cart = await http().post("/api/v1/storefront/cart").set("X-Store-Id", s.id).expect(201);
    const token = cart.body.data.token as string;
    const sf = (m: "get" | "post" | "patch", p: string) =>
      http()[m](`/api/v1/storefront${p}`).set("X-Store-Id", s.id).set("X-Cart-Token", token);
    await sf("post", "/cart/lines").send({ variant_id: s.variant, quantity: 1 }).expect(201);
    await sf("post", "/checkout").expect(200);
    const view = await sf("patch", "/checkout")
      .send({
        email: `shopper-${RUN}@example.com`,
        phone: "+923001234567",
        shipping_address: ADDRESS,
        shipping_method_id: s.shipId,
        payment_method: method,
      })
      .expect(200);
    expect(view.body.data.payment_options.map((o: { key: string }) => o.key)).toContain(method);
    const done = await sf("post", "/checkout/complete")
      .set("Idempotency-Key", `pay-${RUN}-${Math.random()}`)
      .send({})
      .expect(201);
    return {
      orderId: done.body.data.order_id as string,
      key: done.body.data.access_key as string,
      placed: done.body.data,
    };
  };

  const startPayment = (storeId: string, orderId: string, key: string) =>
    http()
      .post(`/api/v1/storefront/orders/${orderId}/payment`)
      .set("X-Store-Id", storeId)
      .set("X-Order-Key", key);
  const ret = (storeId: string, provider: string, params: Record<string, string>) =>
    http()
      .post(`/api/v1/storefront/payments/${provider}/return`)
      .set("X-Store-Id", storeId)
      .send({ params });
  const orderOf = async (owner: ReturnType<typeof api>, id: string) =>
    (await owner.get(`/orders/${id}`).expect(200)).body.data;

  beforeAll(async () => {
    app = await createTestApp([
      { provide: PAYMENT_HTTP, useValue: gateway },
      {
        provide: Mailer,
        useValue: { enabled: true, send: async (e: Email) => (sent.push(e), true) },
      },
    ]);
    admin = await login(app, "platform@cartforge.test");
  });
  beforeEach(() => {
    gateway.calls = [];
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe("Stripe", () => {
    let s: Awaited<ReturnType<typeof makeStore>>;
    const WHSEC = "whsec_test_secret_123";
    let orderId = "";
    let key = "";

    beforeAll(async () => {
      s = await makeStore("USD");
    });

    it("connects with write-only secrets, checked against the mode", async () => {
      const list = (await s.owner.get("/payments/providers").expect(200)).body.data;
      expect(list.providers.map((p: { key: string }) => p.key)).toEqual([
        "safepay",
        "jazzcash",
        "easypaisa",
        "stripe",
      ]);
      expect(
        list.accounts.find((a: { provider: string }) => a.provider === "stripe").connected,
      ).toBe(false);

      const bad = await s.owner
        .put("/payments/accounts/stripe", {
          mode: "test",
          enabled: true,
          credentials: { secret_key: "sk_live_x", webhook_secret: WHSEC },
        })
        .expect(422);
      expect(bad.body.error.fields[0].path).toBe("credentials.secret_key");
      await s.owner
        .put("/payments/accounts/stripe", {
          mode: "test",
          enabled: true,
          credentials: { secret_key: "sk_test_x" },
        })
        .expect(422);

      const saved = (
        await s.owner
          .put("/payments/accounts/stripe", {
            mode: "test",
            enabled: true,
            credentials: { secret_key: "sk_test_abc", webhook_secret: WHSEC },
          })
          .expect(200)
      ).body.data.find((a: { provider: string }) => a.provider === "stripe");
      expect(saved).toMatchObject({ connected: true, enabled: true, mode: "test", values: {} });
      expect(saved.set_fields.sort()).toEqual(["secret_key", "webhook_secret"]);
      expect(saved.webhook_url).toMatch(new RegExp(`/api/v1/payments/webhooks/stripe/${s.id}$`));
      // Stored encrypted; never echoed.
      const row = await prisma.paymentAccount.findFirstOrThrow({
        where: { store_id: s.id, provider: "stripe" },
      });
      expect(row.credentials).toMatch(/^v1\./);
      expect(row.credentials).not.toContain("sk_test_abc");
      expect(JSON.stringify(saved)).not.toContain("sk_test_abc");
      // Updating without re-entering secrets keeps them.
      await s.owner
        .put("/payments/accounts/stripe", { mode: "test", enabled: true, credentials: {} })
        .expect(200);

      const catalog = api(app, await login(app, "catalog@cartforge.test"), s.id);
      await catalog
        .put("/payments/accounts/stripe", { mode: "test", enabled: false, credentials: {} })
        .expect(403);
    });

    it("sends the shopper to Stripe Checkout after placing the order", async () => {
      const o = await placeOrder(s, "stripe");
      orderId = o.orderId;
      key = o.key;
      expect(o.placed.pay_online).toBe(true);
      let order = await orderOf(s.owner, orderId);
      expect(order).toMatchObject({ payment_status: "pending", status: "pending" });
      expect(order.payment.can_pay).toBe(true);

      gateway.answer = () => ({
        status: 200,
        text: JSON.stringify({
          id: "cs_test_A1",
          url: "https://checkout.stripe.com/c/pay/cs_test_A1",
        }),
      });
      await startPayment(s.id, orderId, "wrong-key").expect(404);
      const start = await startPayment(s.id, orderId, key).expect(200);
      expect(start.body.data).toEqual({
        method: "GET",
        url: "https://checkout.stripe.com/c/pay/cs_test_A1",
        fields: {},
      });
      const call = gateway.calls[0]!;
      expect(call.url).toBe("https://api.stripe.com/v1/checkout/sessions");
      expect(call.headers.Authorization).toBe("Bearer sk_test_abc");
      const body = new URLSearchParams(call.body);
      expect(body.get("line_items[0][price_data][unit_amount]")).toBe("375000");
      expect(body.get("line_items[0][price_data][currency]")).toBe("usd");
      expect(body.get("metadata[order_id]")).toBe(orderId);
      expect(body.get("success_url")).toMatch(
        /\/checkout\/return\/stripe.*session_id=\{CHECKOUT_SESSION_ID\}$/,
      );
      order = await orderOf(s.owner, orderId);
      expect(order.payments[0]).toMatchObject({ provider_reference: "cs_test_A1", mode: "test" });
    });

    it("marks the order paid from a signed webhook, once, and rejects forgeries", async () => {
      const event = JSON.stringify({
        id: `evt_${RUN}`,
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_A1",
            payment_status: "paid",
            status: "complete",
            amount_total: 375000,
            currency: "usd",
            payment_intent: "pi_123",
          },
        },
      });
      const hook = () =>
        http()
          .post(`/api/v1/payments/webhooks/stripe/${s.id}`)
          .set("Content-Type", "application/json");
      await hook().set("Stripe-Signature", stripeSig(event, "whsec_wrong")).send(event).expect(400);
      await hook()
        .set("Stripe-Signature", stripeSig(event, WHSEC, Math.floor(Date.now() / 1000) - 3600))
        .send(event)
        .expect(400);
      expect((await orderOf(s.owner, orderId)).payment_status).toBe("pending");

      await hook().set("Stripe-Signature", stripeSig(event, WHSEC)).send(event).expect(200);
      await hook().set("Stripe-Signature", stripeSig(event, WHSEC)).send(event).expect(200); // retried
      const order = await orderOf(s.owner, orderId);
      expect(order).toMatchObject({ payment_status: "paid", status: "processing" });
      expect(order.payment.can_pay).toBe(false);
      expect(
        order.events.filter((e: { type: string }) => e.type === "payment_received"),
      ).toHaveLength(1);
      expect(order.events.at(-1).message).toBe("Paid $3,750.00 through Stripe (test mode)");
      expect(await prisma.paymentEvent.count({ where: { external_id: `evt_${RUN}` } })).toBe(1);
      await startPayment(s.id, orderId, key).expect(409);

      // The shopper's return, after the webhook: verified with Stripe, changes nothing.
      gateway.answer = () => ({
        status: 200,
        text: JSON.stringify({
          id: "cs_test_A1",
          payment_status: "paid",
          status: "complete",
          amount_total: 375000,
          currency: "usd",
          payment_intent: "pi_123",
        }),
      });
      const r = await ret(s.id, "stripe", { session_id: "cs_test_A1" }).expect(200);
      expect(r.body.data).toMatchObject({ order_id: orderId, outcome: "paid" });
      expect(gateway.calls[0]!.url).toBe("https://api.stripe.com/v1/checkout/sessions/cs_test_A1");
    });

    it("refuses to mark paid when the amount doesn't match", async () => {
      const o = await placeOrder(s, "stripe");
      gateway.answer = () => ({
        status: 200,
        text: JSON.stringify({ id: "cs_test_B2", url: "https://checkout.stripe.com/x" }),
      });
      await startPayment(s.id, o.orderId, o.key).expect(200);
      const event = JSON.stringify({
        id: `evt_b_${RUN}`,
        type: "checkout.session.completed",
        data: {
          object: { id: "cs_test_B2", payment_status: "paid", amount_total: 100, currency: "usd" },
        },
      });
      await http()
        .post(`/api/v1/payments/webhooks/stripe/${s.id}`)
        .set("Content-Type", "application/json")
        .set("Stripe-Signature", stripeSig(event, WHSEC))
        .send(event)
        .expect(200);
      const order = await orderOf(s.owner, o.orderId);
      expect(order.payment_status).toBe("pending");
      expect(order.events.at(-1).type).toBe("payment_mismatch");
    });

    it("refunds to the card through Stripe; a Stripe error records nothing", async () => {
      gateway.answer = () => ({
        status: 402,
        text: JSON.stringify({ error: { message: "Insufficient balance" } }),
      });
      const failed = await s.owner
        .post(`/orders/${orderId}/refunds`, { amount_minor: 1000, notify_customer: false })
        .expect(502);
      expect(failed.body.error.message).toBe("Stripe: Insufficient balance");
      expect((await orderOf(s.owner, orderId)).refunded_minor).toBe(0);

      gateway.answer = () => ({
        status: 200,
        text: JSON.stringify({ id: "re_1", status: "succeeded" }),
      });
      const order = (
        await s.owner
          .post(`/orders/${orderId}/refunds`, {
            amount_minor: 1000,
            reason: "Late",
            notify_customer: false,
          })
          .expect(201)
      ).body.data;
      expect(new URLSearchParams(gateway.calls.at(-1)!.body).get("payment_intent")).toBe("pi_123");
      expect(order).toMatchObject({ refunded_minor: 1000, payment_status: "partially_refunded" });
      expect(order.events.at(-1).message).toBe("Refunded $10.00 through Stripe — Late");
      // Or record one that was settled another way.
      const manual = (
        await s.owner
          .post(`/orders/${orderId}/refunds`, {
            amount_minor: 500,
            through_provider: false,
            notify_customer: false,
          })
          .expect(201)
      ).body.data;
      expect(manual.events.at(-1).message).toBe("Refunded $5.00");
    });
  });

  describe("Pakistani providers (PKR)", () => {
    let s: Awaited<ReturnType<typeof makeStore>>;
    const SALT = "salt0123";

    beforeAll(async () => {
      s = await makeStore("PKR");
      await s.owner
        .put("/payments/accounts/jazzcash", {
          mode: "test",
          enabled: true,
          credentials: { merchant_id: "MC123", password: "pw", integrity_salt: SALT },
        })
        .expect(200);
      await s.owner
        .put("/payments/accounts/safepay", {
          mode: "test",
          enabled: true,
          credentials: { api_key: "sec_api", secret_key: "sfpy_secret" },
        })
        .expect(200);
      await s.owner
        .put("/payments/accounts/easypaisa", {
          mode: "test",
          enabled: true,
          credentials: { store_id: "4567", hash_key: "ABCDEFGHIJKLMNOP" },
        })
        .expect(200);
    });

    it("only offers providers that take the store's currency", async () => {
      const usd = await makeStore("USD");
      await usd.owner
        .put("/payments/accounts/jazzcash", {
          mode: "test",
          enabled: true,
          credentials: { merchant_id: "x", password: "y", integrity_salt: "z" },
        })
        .expect(200);
      // Wallet / Raast transfers are rupees only, even if switched on.
      const current = (await usd.owner.get("/settings/checkout").expect(200)).body.data;
      await usd.owner
        .put("/settings/checkout", {
          ...current,
          cod_enabled: true,
          wallet_enabled: true,
          wallet_jazzcash: "03001234567",
          wallet_account_title: "Test",
        })
        .expect(200);
      const cart = await http()
        .post("/api/v1/storefront/cart")
        .set("X-Store-Id", usd.id)
        .expect(201);
      const t = cart.body.data.token;
      await http()
        .post("/api/v1/storefront/cart/lines")
        .set("X-Store-Id", usd.id)
        .set("X-Cart-Token", t)
        .send({ variant_id: usd.variant, quantity: 1 })
        .expect(201);
      const view = await http()
        .post("/api/v1/storefront/checkout")
        .set("X-Store-Id", usd.id)
        .set("X-Cart-Token", t)
        .expect(200);
      const keys = view.body.data.payment_options.map((o: { key: string }) => o.key);
      expect(keys).not.toContain("jazzcash");
      expect(keys).not.toContain("wallet_transfer");
      expect(keys).toContain("cod");
    });

    it("JazzCash: signed form to JazzCash, signed return marks paid, tampering is refused", async () => {
      const o = await placeOrder(s, "jazzcash");
      const start = (await startPayment(s.id, o.orderId, o.key).expect(200)).body.data;
      expect(gateway.calls).toHaveLength(0); // a form post from the browser, no server call
      expect(start.method).toBe("POST");
      expect(start.url).toBe(
        "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
      );
      const f = start.fields as Record<string, string>;
      expect(f).toMatchObject({
        pp_Version: "1.1",
        pp_MerchantID: "MC123",
        pp_Amount: "37500000",
        pp_TxnCurrency: "PKR",
        ppmpf_1: o.orderId,
      });
      expect(f.pp_SecureHash).toBe(jazzcashHash(f, SALT));
      expect(f.pp_ReturnURL).toMatch(/\/checkout\/return\/jazzcash/);

      const back: Record<string, string> = {
        pp_Amount: "37500000",
        pp_TxnCurrency: "PKR",
        pp_TxnRefNo: f.pp_TxnRefNo!,
        pp_ResponseCode: "000",
        pp_ResponseMessage: "Thank you for Using JazzCash, your transaction was successful.",
        pp_RetreivalReferenceNo: "R123",
      };
      back.pp_SecureHash = jazzcashHash(back, SALT);
      await ret(s.id, "jazzcash", { ...back, pp_Amount: "1" }).expect(400);
      const r = await ret(s.id, "jazzcash", back).expect(200);
      expect(r.body.data).toMatchObject({ order_id: o.orderId, outcome: "paid" });
      const order = await orderOf(s.owner, o.orderId);
      expect(order.payment_status).toBe("paid");
      expect(order.events.at(-1).message).toMatch(
        /^Paid PKR\s375,000 through JazzCash \(test mode\)$/,
      );
    });

    it("JazzCash IPN is verified and acknowledged with a signed reply", async () => {
      const o = await placeOrder(s, "jazzcash");
      const f = (await startPayment(s.id, o.orderId, o.key).expect(200)).body.data.fields;
      const ipn: Record<string, string> = {
        pp_Amount: "37500000",
        pp_TxnRefNo: f.pp_TxnRefNo,
        pp_ResponseCode: "000",
        pp_ResponseMessage: "Success",
      };
      ipn.pp_SecureHash = jazzcashHash(ipn, SALT);
      const res = await http()
        .post(`/api/v1/payments/webhooks/jazzcash/${s.id}`)
        .set("Content-Type", "application/json")
        .send(JSON.stringify(ipn))
        .expect(200);
      expect(res.body.pp_ResponseCode).toBe("000");
      expect(res.body.pp_SecureHash).toBe(
        jazzcashHash({ pp_ResponseCode: "000", pp_ResponseMessage: "IPN received" }, SALT),
      );
      expect((await orderOf(s.owner, o.orderId)).payment_status).toBe("paid");
    });

    it("JazzCash: a declined payment leaves the order open with the reason, ready to retry", async () => {
      const o = await placeOrder(s, "jazzcash");
      const f = (await startPayment(s.id, o.orderId, o.key).expect(200)).body.data.fields;
      const back: Record<string, string> = {
        pp_TxnRefNo: f.pp_TxnRefNo,
        pp_ResponseCode: "124",
        pp_ResponseMessage: "Order placed, awaiting payment",
      };
      back.pp_SecureHash = jazzcashHash(back, SALT);
      await ret(s.id, "jazzcash", back).expect(200);
      const declined: Record<string, string> = {
        pp_TxnRefNo: f.pp_TxnRefNo,
        pp_ResponseCode: "199",
        pp_ResponseMessage: "Transaction declined",
      };
      declined.pp_SecureHash = jazzcashHash(declined, SALT);
      await ret(s.id, "jazzcash", declined).expect(200);
      const order = await orderOf(s.owner, o.orderId);
      expect(order.payment_status).toBe("pending");
      expect(order.payments[0].failure_reason).toBe("Transaction declined");
      const customer = await http()
        .get(`/api/v1/storefront/orders/${o.orderId}`)
        .set("X-Store-Id", s.id)
        .set("X-Order-Key", o.key)
        .expect(200);
      expect(customer.body.data.payment).toMatchObject({
        can_pay: true,
        failure_reason: "Transaction declined",
      });
      await startPayment(s.id, o.orderId, o.key).expect(200); // retry gets a new reference
    });

    it("Safepay: tracker from Safepay, signed redirect marks paid", async () => {
      const o = await placeOrder(s, "safepay");
      gateway.answer = () => ({
        status: 201,
        text: JSON.stringify({ data: { token: `track_${RUN}` } }),
      });
      const start = (await startPayment(s.id, o.orderId, o.key).expect(200)).body.data;
      expect(gateway.calls[0]!.url).toBe("https://sandbox.api.getsafepay.com/order/v1/init");
      expect(JSON.parse(gateway.calls[0]!.body)).toEqual({
        client: "sec_api",
        amount: 375000,
        currency: "PKR",
        environment: "sandbox",
      });
      expect(start.method).toBe("GET");
      expect(new URL(start.url).searchParams.get("beacon")).toBe(`track_${RUN}`);

      await ret(s.id, "safepay", { tracker: `track_${RUN}`, sig: "forged" }).expect(400);
      const r = await ret(s.id, "safepay", {
        tracker: `track_${RUN}`,
        reference: "SP1",
        sig: safepaySignature(`track_${RUN}`, "sfpy_secret"),
      }).expect(200);
      expect(r.body.data.outcome).toBe("paid");
      expect((await orderOf(s.owner, o.orderId)).payment_status).toBe("paid");
    });

    it("Easypaisa: encrypted request, auth-token hop, and no 'paid' without verification", async () => {
      const o = await placeOrder(s, "easypaisa");
      const start = (await startPayment(s.id, o.orderId, o.key).expect(200)).body.data;
      expect(start.url).toBe("https://easypaystg.easypaisa.com.pk/easypay/Index.jsf");
      const f = start.fields as Record<string, string>;
      expect(f).toMatchObject({
        storeId: "4567",
        amount: "375000.0",
        autoRedirect: "1",
        mobileNum: "03001234567",
      });
      const d = createDecipheriv("aes-128-ecb", Buffer.from("ABCDEFGHIJKLMNOP"), null);
      const plain = Buffer.concat([
        d.update(Buffer.from(f.merchantHashedReq!, "base64")),
        d.final(),
      ]).toString();
      expect(plain.startsWith("amount=375000.0&autoRedirect=1&emailAddr=")).toBe(true);

      const hop = (
        await ret(s.id, "easypaisa", {
          auth_token: "tok1",
          postBackURL: f.postBackURL!,
          orderRefNumber: f.orderRefNum!,
        }).expect(200)
      ).body.data;
      expect(hop.redirect).toEqual({
        method: "POST",
        url: "https://easypaystg.easypaisa.com.pk/easypay/Confirm.jsf",
        fields: { auth_token: "tok1", postBackURL: f.postBackURL },
      });
      // Final redirect claims success, but it isn't signed and no API login is set up.
      const fin = (
        await ret(s.id, "easypaisa", {
          status: "0000",
          desc: "success",
          orderRefNumber: f.orderRefNum!,
        }).expect(200)
      ).body.data;
      expect(fin.outcome).toBe("pending");
      const order = await orderOf(s.owner, o.orderId);
      expect(order.payment_status).toBe("pending");
      expect(order.events.at(-1).message).toMatch(
        /Confirm this payment in the Easypay merchant portal/,
      );

      // With the API login, Easypay is asked and confirms.
      await s.owner
        .put("/payments/accounts/easypaisa", {
          mode: "test",
          enabled: true,
          credentials: { account_number: "123", api_username: "u", api_password: "p" },
        })
        .expect(200);
      gateway.answer = () => ({
        status: 200,
        text: JSON.stringify({
          responseCode: "0000",
          transactionStatus: "PAID",
          transactionAmount: "375000.0",
          transactionId: "EP9",
        }),
      });
      const ok = (
        await ret(s.id, "easypaisa", { status: "0000", orderRefNumber: f.orderRefNum! }).expect(200)
      ).body.data;
      expect(ok.outcome).toBe("paid");
      expect(gateway.calls.at(-1)!.headers.Credentials).toBe(Buffer.from("u:p").toString("base64"));
      expect((await orderOf(s.owner, o.orderId)).payment_status).toBe("paid");
    });

    it("wallet / Raast transfer: validated numbers, clear instructions, merchant confirms", async () => {
      const current = (await s.owner.get("/settings/checkout").expect(200)).body.data;
      const bad = await s.owner
        .put("/settings/checkout", {
          ...current,
          wallet_enabled: true,
          wallet_jazzcash: "12345",
          wallet_iban: "PK00",
        })
        .expect(422);
      const paths = bad.body.error.fields.map((f: { path: string }) => f.path);
      expect(paths).toEqual(
        expect.arrayContaining(["wallet_jazzcash", "wallet_iban", "wallet_account_title"]),
      );

      const saved = (
        await s.owner
          .put("/settings/checkout", {
            ...current,
            wallet_enabled: true,
            wallet_jazzcash: "+92 300-1234567",
            wallet_raast_id: "0345 7654321",
            wallet_iban: "pk36 scbl 0000 0011 2345 6702",
            wallet_account_title: "Silsila Studio",
            wallet_note: "Send a screenshot on WhatsApp 0300 1234567.",
          })
          .expect(200)
      ).body.data;
      expect(saved).toMatchObject({
        wallet_jazzcash: "03001234567",
        wallet_iban: "PK36SCBL0000001123456702",
      });

      const o = await placeOrder(s, "wallet_transfer");
      const customer = (
        await http()
          .get(`/api/v1/storefront/orders/${o.orderId}`)
          .set("X-Store-Id", s.id)
          .set("X-Order-Key", o.key)
          .expect(200)
      ).body.data;
      expect(customer.payment).toMatchObject({
        method: "wallet_transfer",
        online: false,
        can_pay: false,
      });
      expect(customer.payment.instructions).toBe(
        [
          "Send the order total to any of these:",
          "• JazzCash: 0300 1234567",
          "• Raast ID: 0345 7654321",
          "• IBAN: PK36 SCBL 0000 0011 2345 6702",
          "Account title: Silsila Studio",
          `Reference: order ${customer.number}`,
          "Send a screenshot on WhatsApp 0300 1234567.",
        ].join("\n"),
      );
      expect(o.placed.pay_online).toBe(false);
      await s.owner
        .post(`/orders/${o.orderId}/mark-paid`, { reference: "Raast TID 998877" })
        .expect(200);
    });
  });
});
