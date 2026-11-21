import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { api, createTestApp, login, RUN } from "./app";
import { TEST_ENV } from "./test-env";

/**
 * Next 8 — discounts: codes and automatic discounts, minimums, buy X get Y,
 * free shipping, combining, usage limits counted when the order is placed.
 */
describe("discounts", () => {
  let app: INestApplication;
  let edition: string | undefined;
  let owner: ReturnType<typeof api>;
  let storeId = "";
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  let suit: { id: string; variant: string };
  let dupatta: { id: string; variant: string };
  let accessories = "";
  let courier = "";

  const http = () => request(app.getHttpServer());
  const sf = (p: string) => `/api/v1/storefront${p}`;
  const ADDRESS = {
    first_name: "Ayesha",
    last_name: "Khan",
    address1: "12 Mall Road",
    city: "Lahore",
    region: "Punjab",
    postal_code: "54000",
    country: "PK",
  };

  /** A cart with these lines, at checkout with an address and shipping chosen. */
  const checkout = async (lines: [string, number][], email = `d-${RUN}@example.com`) => {
    const token = (await http().post(sf("/cart")).set("X-Store-Id", storeId).expect(201)).body.data
      .token as string;
    const c = {
      post: (p: string, b: object = {}) =>
        http().post(sf(p)).set("X-Store-Id", storeId).set("X-Cart-Token", token).send(b),
      patch: (p: string, b: object) =>
        http().patch(sf(p)).set("X-Store-Id", storeId).set("X-Cart-Token", token).send(b),
    };
    for (const [variant, quantity] of lines)
      await c.post("/cart/lines", { variant_id: variant, quantity }).expect(201);
    await c.post("/checkout").expect(200);
    await c
      .patch("/checkout", {
        email,
        shipping_address: ADDRESS,
        shipping_method_id: courier,
        payment_method: "cod",
      })
      .expect(200);
    return c;
  };

  beforeAll(async () => {
    edition = process.env.CARTFORGE_EDITION;
    process.env.CARTFORGE_EDITION = "saas";
    app = await createTestApp();
    const merchant = await login(app, "other@cartforge.test");
    storeId = (
      await http()
        .post("/api/v1/stores")
        .set("Cookie", merchant.cookies)
        .set("X-CSRF-Token", merchant.csrf)
        .send({ store_name: `Eid Sale ${RUN}`, currency: "PKR" })
        .expect(201)
    ).body.data.store_id;
    owner = api(app, merchant, storeId);
    const mk = async (title: string, price: number) => {
      const p = (
        await owner
          .post("/products", {
            title: `${title} ${RUN}`,
            price_minor: price,
            status: "active",
            inventory_quantity: 50,
          })
          .expect(201)
      ).body.data;
      return { id: p.id as string, variant: p.variants[0].id as string };
    };
    suit = await mk("Lawn Suit", 4000);
    dupatta = await mk("Chiffon Dupatta", 1000);
    accessories = (
      await owner
        .post("/collections", { title: `Accessories ${RUN}`, status: "active" })
        .expect(201)
    ).body.data.id;
    await prisma.collectionProduct.upsert({
      where: { collection_id_product_id: { collection_id: accessories, product_id: dupatta.id } },
      create: {
        collection_id: accessories,
        product_id: dupatta.id,
        store_id: storeId,
        position: 0,
      },
      update: {},
    });
    courier = (
      await owner
        .post("/shipping-methods", { name: "Courier", price_minor: 250, countries: ["PK"] })
        .expect(201)
    ).body.data.id;
    const settings = (await owner.get("/settings/checkout").expect(200)).body.data;
    await owner.put("/settings/checkout", { ...settings, cod_enabled: true }).expect(200);
  });

  afterAll(async () => {
    if (edition === undefined) delete process.env.CARTFORGE_EDITION;
    else process.env.CARTFORGE_EDITION = edition;
    await prisma.$disconnect();
    await app.close();
  });

  it("validates discounts", async () => {
    const bad = await owner
      .post("/discounts", {
        title: "Broken",
        method: "code",
        kind: "order",
        value_type: "percent",
        value: 20_000,
      })
      .expect(422);
    expect(bad.body.error.fields.map((f: { path: string }) => f.path)).toEqual(
      expect.arrayContaining(["code", "value"]),
    );
    await owner
      .post("/discounts", {
        title: "No target",
        method: "automatic",
        kind: "products",
        value: 1000,
        target: { all: false, product_ids: [], collection_ids: [] },
      })
      .expect(422);
  });

  it("a code with a minimum: a note until it's met, then applied", async () => {
    const eid = (
      await owner
        .post("/discounts", {
          title: "Eid 10%",
          method: "code",
          code: "eid10",
          kind: "order",
          value_type: "percent",
          value: 1000,
          min_subtotal_minor: 5000,
        })
        .expect(201)
    ).body.data;
    expect(eid).toMatchObject({ code: "EID10", status: "active", summary: "10% off the order" });
    await owner
      .post("/discounts", {
        title: "Dup",
        method: "code",
        code: "EID10",
        kind: "order",
        value: 500,
      })
      .expect(422);

    const c = await checkout([[suit.variant, 1]]);
    const wrong = await c.patch("/checkout", { discount_code: "NOPE" }).expect(422);
    expect(wrong.body.error.fields[0]).toMatchObject({
      path: "discount_code",
      message: "This code isn't valid.",
    });
    let v = (await c.patch("/checkout", { discount_code: "eid10" }).expect(200)).body.data;
    expect(v).toMatchObject({ discount_code: "EID10", discounts: [] });
    expect(v.discount_note).toMatch(/Spend .*1,000 more to use EID10/);
    await c.post("/cart/lines", { variant_id: suit.variant, quantity: 1 }).expect(201);
    v = (await c.post("/checkout").expect(200)).body.data;
    expect(v.discounts).toEqual([
      expect.objectContaining({ code: "EID10", kind: "order", amount_minor: 800 }),
    ]);
    expect(v.totals).toMatchObject({
      subtotal_minor: 8000,
      discount_minor: 800,
      total_minor: 8000 - 800 + 250,
    });
    // Removing the code.
    v = (await c.patch("/checkout", { discount_code: null }).expect(200)).body.data;
    expect(v).toMatchObject({ discount_code: null, discounts: [] });
  });

  it("automatic buy X get Y beats a smaller code; free shipping combines", async () => {
    const bxgy = (
      await owner
        .post("/discounts", {
          title: "Buy 2 suits, get a dupatta free",
          method: "automatic",
          kind: "bxgy",
          value_type: "percent",
          value: 10_000,
          target: { all: false, product_ids: [], collection_ids: [accessories] },
          buy: {
            quantity: 2,
            target: { all: false, product_ids: [suit.id], collection_ids: [] },
            get_quantity: 1,
            max_uses: 1,
          },
          combines: true,
        })
        .expect(201)
    ).body.data;
    expect(bxgy.summary).toBe("Buy 2, get 1 free");
    const c = await checkout([
      [suit.variant, 2],
      [dupatta.variant, 1],
    ]);
    // EID10 alone would save 900; the free dupatta saves 1,000.
    let v = (await c.patch("/checkout", { discount_code: "EID10" }).expect(200)).body.data;
    expect(v.discounts.map((d: { title: string }) => d.title)).toEqual([
      "Buy 2 suits, get a dupatta free",
    ]);
    expect(v.discount_note).toBe("A better discount is already applied to your order.");
    expect(v.totals).toMatchObject({ discount_minor: 1000, total_minor: 8000 + 250 });

    await owner
      .post("/discounts", {
        title: "Free delivery",
        method: "code",
        code: "FREESHIP",
        kind: "shipping",
        combines: true,
      })
      .expect(201);
    v = (await c.patch("/checkout", { discount_code: "FREESHIP" }).expect(200)).body.data;
    expect(v.discounts.map((d: { kind: string }) => d.kind).sort()).toEqual(["bxgy", "shipping"]);
    expect(v.totals).toMatchObject({
      discount_minor: 1000,
      shipping_minor: 0,
      shipping_discount_minor: 250,
      total_minor: 8000,
    });

    // The order keeps its discounts; lines carry their share.
    const placed = (
      await c.post("/checkout/complete").set("Idempotency-Key", `bx-${RUN}`).expect(201)
    ).body.data;
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: placed.order_id },
      include: { items: true },
    });
    expect(Number(order.discount_minor)).toBe(1000);
    expect(Number(order.shipping_minor)).toBe(0);
    expect((order.discounts as { kind: string }[]).map((d) => d.kind).sort()).toEqual([
      "bxgy",
      "shipping",
    ]);
    expect(order.items.find((i) => i.variant_id === dupatta.variant)).toMatchObject({
      discount_minor: 1000n,
    });
    const detail = (await owner.get(`/orders/${placed.order_id}`).expect(200)).body.data;
    expect(detail.discounts).toHaveLength(2);
    const free = await prisma.discount.findFirstOrThrow({
      where: { store_id: storeId, code: "FREESHIP" },
    });
    expect(free.used_count).toBe(1);
    // Turn the automatic one off for the next tests.
    await prisma.discount.update({ where: { id: bxgy.id }, data: { enabled: false } });
  });

  it("usage limits and once per customer are enforced", async () => {
    await owner
      .post("/discounts", {
        title: "First 1 only",
        method: "code",
        code: `ONCE${RUN}`.toUpperCase(),
        kind: "order",
        value_type: "fixed",
        value: 300,
        usage_limit: 1,
      })
      .expect(201);
    await owner
      .post("/discounts", {
        title: "Welcome",
        method: "code",
        code: "WELCOME",
        kind: "products",
        value_type: "percent",
        value: 2000,
        target: { all: true, product_ids: [], collection_ids: [] },
        once_per_customer: true,
      })
      .expect(201);

    const a = await checkout([[suit.variant, 1]], `first-${RUN}@example.com`);
    const v = (await a.patch("/checkout", { discount_code: `ONCE${RUN}` }).expect(200)).body.data;
    expect(v.totals.discount_minor).toBe(300);
    await a.post("/checkout/complete").set("Idempotency-Key", `once-${RUN}`).expect(201);
    const b = await checkout([[suit.variant, 1]], `second-${RUN}@example.com`);
    const used = await b.patch("/checkout", { discount_code: `ONCE${RUN}` }).expect(422);
    expect(used.body.error.fields[0].message).toBe("This code has reached its usage limit.");

    const w1 = await checkout([[suit.variant, 1]], `ali-${RUN}@example.com`);
    expect(
      (await w1.patch("/checkout", { discount_code: "WELCOME" }).expect(200)).body.data.totals
        .discount_minor,
    ).toBe(800);
    await w1.post("/checkout/complete").set("Idempotency-Key", `w1-${RUN}`).expect(201);
    const w2 = await checkout([[suit.variant, 1]], `ALI-${RUN}@example.com`);
    const again = await w2.patch("/checkout", { discount_code: "WELCOME" }).expect(422);
    expect(again.body.error.fields[0].message).toBe("You've already used this code.");
  });

  it("lists discounts with status and use counts", async () => {
    const list = (await owner.get("/discounts").expect(200)).body.data as {
      code: string | null;
      status: string;
      used_count: number;
    }[];
    expect(list.find((d) => d.code === `ONCE${RUN}`.toUpperCase())).toMatchObject({
      status: "used_up",
      used_count: 1,
    });
    expect(list.find((d) => d.code === "EID10")?.status).toBe("active");
    const scheduled = (
      await owner
        .post("/discounts", {
          title: "Black Friday",
          method: "code",
          code: "BF",
          kind: "order",
          value: 2500,
          starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(422)
    ).body;
    expect(scheduled.error.fields[0].path).toBe("code"); // at least 3 characters
  });
});
