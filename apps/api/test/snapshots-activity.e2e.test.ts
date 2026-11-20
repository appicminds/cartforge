import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { SEED_STORES } from "@cartforge/database/seed";
import { OrderSnapshotService } from "../src/orders/order-snapshot.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { api, createTestApp, login, RUN } from "./app";
import { TEST_ENV } from "./test-env";

const MAIN = SEED_STORES.main.id;

describe("order snapshots (§8.8 rule 7, §29.2 #32) and product activity (§8.5)", () => {
  let app: INestApplication;
  let admin: ReturnType<typeof api>;
  let catalog: ReturnType<typeof api>;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);

  beforeAll(async () => {
    app = await createTestApp();
    admin = api(app, await login(app, "admin@cartforge.test"), MAIN);
    catalog = api(app, await login(app, "catalog@cartforge.test"), MAIN);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const placeOrder = async (variantId: string, quantity: number) => {
    const svc = app.get(OrderSnapshotService);
    const db = app.get(PrismaService);
    return db.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          store_id: MAIN,
          number: `T-${RUN}-${Math.random().toString(36).slice(2, 8)}`,
          currency: "USD",
        },
      });
      return svc.addLine(tx, {
        store_id: MAIN,
        order_id: order.id,
        variant_id: variantId,
        quantity,
      });
    });
  };

  describe("order item snapshots", () => {
    it("copy catalog data at purchase time and never change afterwards", async () => {
      const p = (
        await admin
          .post("/products", {
            title: `Snap Tee ${RUN}`,
            price_minor: 2500,
            sku: `SNAP-${RUN}`,
            status: "active",
          })
          .expect(201)
      ).body.data;
      await admin
        .put(`/products/${p.id}/options`, { options: [{ name: "Size", values: ["S", "M"] }] })
        .expect(200);
      const detail = (await admin.get(`/products/${p.id}`).expect(200)).body.data;
      const m = detail.variants.find((v: { title: string }) => v.title === "M");
      const line = await placeOrder(m.id, 2);
      expect(line).toMatchObject({
        product_title: `Snap Tee ${RUN}`,
        variant_title: "M",
        quantity: 2,
        currency: "USD",
      });
      expect(Number(line.unit_price_minor)).toBe(2500);
      expect(line.option_values).toEqual([{ option: "Size", value: "M" }]);

      // Later edits: title, price, SKU, option rename, archive, delete.
      await admin.patch(`/products/${p.id}`, { title: `Renamed ${RUN}` }).expect(200);
      await admin.patch(`/variants/${m.id}`, { price_minor: 9999, sku: `NEW-${RUN}` }).expect(200);
      await admin
        .put(`/products/${p.id}/options`, {
          options: [{ name: "Size", values: ["S"] }],
          confirm_removals: true,
        })
        .expect(200);
      await admin.post(`/products/${p.id}/archive`).expect(200);
      await admin.delete(`/products/${p.id}`).expect(200);

      const after = await prisma.orderItem.findUniqueOrThrow({ where: { id: line.id } });
      expect(after).toMatchObject({
        product_title: `Snap Tee ${RUN}`,
        variant_title: "M",
        sku: null,
        quantity: 2,
      });
      expect(Number(after.unit_price_minor)).toBe(2500);
      expect(after.option_values).toEqual([{ option: "Size", value: "M" }]);
    });

    it("rejects any change to a snapshot at the database level", async () => {
      const p = (
        await admin
          .post("/products", { title: `Locked ${RUN}`, price_minor: 100, status: "active" })
          .expect(201)
      ).body.data;
      const line = await placeOrder(p.variants[0].id, 1);
      await expect(
        prisma.orderItem.update({ where: { id: line.id }, data: { unit_price_minor: 1n } }),
      ).rejects.toThrow(/immutable/);
      await expect(
        prisma.orderItem.update({ where: { id: line.id }, data: { product_title: "Edited" } }),
      ).rejects.toThrow(/immutable/);
      await expect(prisma.orderItem.delete({ where: { id: line.id } })).rejects.toThrow(
        /immutable/,
      );
    });

    it("never sells drafts or unpriced items (price comes from the server)", async () => {
      const draft = (
        await admin.post("/products", { title: `Draft ${RUN}`, price_minor: 100 }).expect(201)
      ).body.data;
      await expect(placeOrder(draft.variants[0].id, 1)).rejects.toThrow(/no longer available/);
    });
  });

  describe("product activity", () => {
    it("lists changes and stock movements newest first with actors", async () => {
      const p = (
        await admin
          .post("/products", { title: `Timeline ${RUN}`, price_minor: 1000, inventory_quantity: 3 })
          .expect(201)
      ).body.data;
      await catalog
        .patch(`/products/${p.id}`, { title: `Timeline v2 ${RUN}`, price_minor: 1200 })
        .expect(200);
      await catalog.patch(`/products/${p.id}`, { status: "active" }).expect(200);
      await admin
        .post("/inventory/adjustments", {
          variant_id: p.variants[0].id,
          quantity: 4,
          reason: "received",
        })
        .expect(201);

      const res = await catalog.get(`/products/${p.id}/activity`).expect(200);
      const rows = res.body.data.map((e: { summary: string; actor: { name: string } | null }) => [
        e.summary,
        e.actor?.name,
      ]);
      expect(rows[0]).toEqual(["Stock received: +4 (3 → 7)", "Adam Admin"]);
      expect(rows).toEqual(
        expect.arrayContaining([
          ["Changed status to Active", "Cara Catalog"],
          ["Updated title, pricing", "Cara Catalog"],
          ["Stock set initially: +3 (0 → 3)", "Adam Admin"],
          ["Created the product", "Adam Admin"],
        ]),
      );
      const times = res.body.data.map((e: { at: string }) => e.at);
      expect([...times].sort().reverse()).toEqual(times);
    });

    it("is store-scoped", async () => {
      const other = api(app, await login(app, "other@cartforge.test"), SEED_STORES.second.id);
      const p = (await catalog.post("/products", { title: `Private ${RUN}` }).expect(201)).body
        .data;
      await other.get(`/products/${p.id}/activity`).expect(404);
    });
  });
});
