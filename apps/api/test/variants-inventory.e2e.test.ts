import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { SEED_STORES } from "@cartforge/database/seed";
import { api, createTestApp, login, RUN } from "./app";
import { TEST_ENV } from "./test-env";

const MAIN = SEED_STORES.main.id;
const SECOND = SEED_STORES.second.id;

type Variant = {
  id: string;
  title: string;
  sku: string | null;
  price_minor: number | null;
  inventory: {
    on_hand: number;
    available: number;
    state: string;
    low_stock_threshold: number | null;
  };
};

describe("variants + inventory (Sprint 3)", () => {
  let app: INestApplication;
  let admin: ReturnType<typeof api>;
  let catalog: ReturnType<typeof api>;
  let orders: ReturnType<typeof api>;
  let ownerSecond: ReturnType<typeof api>;
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);

  beforeAll(async () => {
    app = await createTestApp();
    admin = api(app, await login(app, "admin@cartforge.test"), MAIN);
    catalog = api(app, await login(app, "catalog@cartforge.test"), MAIN);
    orders = api(app, await login(app, "orders@cartforge.test"), MAIN);
    ownerSecond = api(app, await login(app, "owner@cartforge.test"), SECOND);
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const byTitle = (vs: Variant[]) => Object.fromEntries(vs.map((v) => [v.title, v]));

  describe("simple products", () => {
    it("creates with SKU, initial stock (as a movement) and a low-stock threshold", async () => {
      const res = await admin
        .post("/products", {
          title: `Stocked ${RUN}`,
          price_minor: 1500,
          sku: `STK-${RUN}`,
          inventory_quantity: 7,
          low_stock_threshold: 2,
        })
        .expect(201);
      const v: Variant = res.body.data.variants[0];
      expect(v).toMatchObject({
        sku: `STK-${RUN}`,
        inventory: { on_hand: 7, available: 7, state: "in_stock", low_stock_threshold: 2 },
      });
      const moves = await admin.get(`/inventory/movements?variant_id=${v.id}`).expect(200);
      expect(moves.body.data[0]).toMatchObject({
        movement_type: "initial",
        quantity_delta: 7,
        quantity_before: 0,
        quantity_after: 7,
      });
      expect(moves.body.data[0].actor.name).toBe("Adam Admin");
    });

    it("requires inventory.adjust to set initial stock", async () => {
      const res = await catalog
        .post("/products", { title: `No stock perm ${RUN}`, inventory_quantity: 3 })
        .expect(403);
      expect(res.body.error.fields[0].path).toBe("inventory_quantity");
    });

    it("enforces SKU uniqueness across the store but not across stores", async () => {
      await catalog.post("/products", { title: "A", sku: `DUP-${RUN}` }).expect(201);
      const dup = await catalog.post("/products", { title: "B", sku: `DUP-${RUN}` }).expect(409);
      expect(dup.body.error.code).toBe("SKU_TAKEN");
      await ownerSecond.post("/products", { title: "C", sku: `DUP-${RUN}` }).expect(201);
      const { body } = await catalog.post("/products", { title: "D" }).expect(201);
      const patch = await catalog
        .patch(`/products/${body.data.id}`, { sku: `DUP-${RUN}` })
        .expect(409);
      expect(patch.body.error.fields[0].path).toBe("sku");
    });
  });

  describe("options and variant generation (PRD §8.4 F)", () => {
    let id: string;
    beforeAll(async () => {
      const res = await admin
        .post("/products", {
          title: `Tee ${RUN}`,
          price_minor: 2000,
          sku: `TEE-${RUN}`,
          inventory_quantity: 5,
        })
        .expect(201);
      id = res.body.data.id;
    });

    it("previews without changing anything", async () => {
      const res = await catalog
        .post(`/products/${id}/options/preview`, {
          options: [{ name: "Size", values: ["S", "M", "L"] }],
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        keep: [{ from_title: "Default", title: "S" }],
        create: [{ title: "M" }, { title: "L" }],
        remove: [],
        total_after: 3,
      });
      const product = await catalog.get(`/products/${id}`).expect(200);
      expect(product.body.data.product_type).toBe("simple");
    });

    it("converts simple → variable, keeping the default variant's SKU, price and stock", async () => {
      const res = await catalog
        .put(`/products/${id}/options`, { options: [{ name: "Size", values: ["S", "M", "L"] }] })
        .expect(200);
      const p = res.body.data;
      expect(p.product_type).toBe("variable");
      expect(p.options).toEqual([
        expect.objectContaining({
          name: "Size",
          values: [
            expect.objectContaining({ value: "S" }),
            expect.objectContaining({ value: "M" }),
            expect.objectContaining({ value: "L" }),
          ],
        }),
      ]);
      const v = byTitle(p.variants);
      expect(v.S).toMatchObject({
        sku: `TEE-${RUN}`,
        price_minor: 2000,
        inventory: { on_hand: 5 },
      });
      // New variants start from the template's price, with no stock and no SKU.
      expect(v.M).toMatchObject({
        sku: null,
        price_minor: 2000,
        inventory: { on_hand: 0, state: "out" },
      });
      expect(p.variants.map((x: Variant) => x.title)).toEqual(["S", "M", "L"]);
      expect(p.variants[0].option_values).toEqual([{ option: "Size", value: "S" }]);
    });

    it("requires confirmation before removing variants", async () => {
      const blocked = await catalog
        .put(`/products/${id}/options`, { options: [{ name: "Size", values: ["S", "M"] }] })
        .expect(409);
      expect(blocked.body.error.code).toBe("VARIANT_REMOVAL_REQUIRES_CONFIRMATION");
      expect(blocked.body.error.fields.map((f: { message: string }) => f.message)).toEqual(["L"]);
      const ok = await catalog
        .put(`/products/${id}/options`, {
          options: [{ name: "Size", values: ["S", "M"] }],
          confirm_removals: true,
        })
        .expect(200);
      expect(ok.body.plan.remove.map((r: { title: string }) => r.title)).toEqual(["L"]);
      expect(ok.body.data.variants.map((x: Variant) => x.title)).toEqual(["S", "M"]);
    });

    it("adding an option keeps existing variants (mapped to its first value)", async () => {
      const res = await catalog
        .put(`/products/${id}/options`, {
          options: [
            { name: "Size", values: ["S", "M"] },
            { name: "Color", values: ["Red", "Blue"] },
          ],
        })
        .expect(200);
      const v = byTitle(res.body.data.variants);
      expect(Object.keys(v)).toEqual(["S / Red", "S / Blue", "M / Red", "M / Blue"]);
      expect(v["S / Red"]).toMatchObject({ sku: `TEE-${RUN}`, inventory: { on_hand: 5 } });
    });

    it("edits a variant: SKU, price, threshold, image validation", async () => {
      const p = (await catalog.get(`/products/${id}`).expect(200)).body.data;
      const target = byTitle(p.variants)["M / Blue"]!;
      const res = await catalog
        .patch(`/variants/${target.id}`, {
          sku: `TEE-MB-${RUN}`,
          price_minor: 2200,
          compare_at_minor: 2600,
          low_stock_threshold: 3,
        })
        .expect(200);
      expect(byTitle(res.body.data.variants)["M / Blue"]).toMatchObject({
        sku: `TEE-MB-${RUN}`,
        price_minor: 2200,
        inventory: { low_stock_threshold: 3 },
      });
      const dup = await catalog.patch(`/variants/${target.id}`, { sku: `TEE-${RUN}` }).expect(409);
      expect(dup.body.error.code).toBe("SKU_TAKEN");
      await catalog.patch(`/variants/${target.id}`, { compare_at_minor: 2100 }).expect(422);
      const img = await catalog
        .patch(`/variants/${target.id}`, { media_asset_id: "00000000-0000-4000-8000-000000000999" })
        .expect(422);
      expect(img.body.error.fields[0].path).toBe("media_asset_id");
    });

    it("bulk-edits prices on selected variants", async () => {
      const p = (await catalog.get(`/products/${id}`).expect(200)).body.data;
      const ids = p.variants
        .filter((v: Variant) => v.title.startsWith("S"))
        .map((v: Variant) => v.id);
      const res = await catalog
        .patch(`/products/${id}/variants`, { variant_ids: ids, set: { price_minor: 1800 } })
        .expect(200);
      const v = byTitle(res.body.data.variants);
      expect(v["S / Red"]!.price_minor).toBe(1800);
      expect(v["S / Blue"]!.price_minor).toBe(1800);
      expect(v["M / Blue"]!.price_minor).toBe(2200);
    });

    it("lists the price range for variable products", async () => {
      const list = await catalog.get(`/products?q=${encodeURIComponent(`Tee ${RUN}`)}`).expect(200);
      expect(list.body.data[0]).toMatchObject({
        product_type: "variable",
        price_minor: 1800,
        price_max_minor: 2200,
        variant_count: 4,
        inventory_available: 5,
      });
    });

    it("rejects product-level SKU/stock fields on variable products", async () => {
      const res = await catalog.patch(`/products/${id}`, { sku: "X" }).expect(422);
      expect(res.body.error.fields[0].path).toBe("sku");
    });

    it("blocks publishing while any variant has no price", async () => {
      const p = (await catalog.get(`/products/${id}`).expect(200)).body.data;
      await catalog.patch(`/variants/${p.variants[1].id}`, { price_minor: null }).expect(200);
      const res = await catalog.patch(`/products/${id}`, { status: "active" }).expect(422);
      expect(res.body.error.fields[0].message).toContain("S / Blue");
      await catalog.patch(`/variants/${p.variants[1].id}`, { price_minor: 1800 }).expect(200);
      await catalog.patch(`/products/${id}`, { status: "active" }).expect(200);
    });

    it("converts back to simple, keeping the first variant", async () => {
      const res = await catalog
        .put(`/products/${id}/options`, { options: [], confirm_removals: true })
        .expect(200);
      expect(res.body.data).toMatchObject({ product_type: "simple", options: [] });
      expect(res.body.data.variants).toHaveLength(1);
      expect(res.body.data.variants[0]).toMatchObject({ title: "Default", sku: `TEE-${RUN}` });
    });

    it("is isolated per store", async () => {
      const p = (await catalog.get(`/products/${id}`).expect(200)).body.data;
      await ownerSecond.patch(`/variants/${p.variants[0].id}`, { sku: "HIJACK" }).expect(404);
      await ownerSecond.put(`/products/${id}/options`, { options: [] }).expect(404);
    });
  });

  describe("inventory adjustments (PRD §9)", () => {
    let variantId: string;
    beforeAll(async () => {
      const res = await admin
        .post("/products", {
          title: `Ledger ${RUN}`,
          sku: `LED-${RUN}`,
          inventory_quantity: 10,
          low_stock_threshold: 4,
        })
        .expect(201);
      variantId = res.body.data.variants[0].id;
    });

    it("adds, removes and sets stock with an audit trail", async () => {
      await admin
        .post("/inventory/adjustments", { variant_id: variantId, quantity: 5, reason: "received" })
        .expect(201);
      await admin
        .post("/inventory/adjustments", {
          variant_id: variantId,
          quantity: -3,
          reason: "damaged",
          note: "Water damage",
        })
        .expect(201);
      const set = await admin
        .post("/inventory/adjustments", {
          variant_id: variantId,
          mode: "set",
          quantity: 4,
          reason: "correction",
        })
        .expect(201);
      expect(set.body.data).toMatchObject({ on_hand: 4, available: 4, state: "low" });

      const moves = (await admin.get(`/inventory/movements?variant_id=${variantId}`).expect(200))
        .body.data;
      expect(
        moves.map(
          (m: { movement_type: string; quantity_delta: number; quantity_after: number }) => [
            m.movement_type,
            m.quantity_delta,
            m.quantity_after,
          ],
        ),
      ).toEqual([
        ["correction", -8, 4],
        ["damaged", -3, 12],
        ["received", 5, 15],
        ["initial", 10, 10],
      ]);
      expect(moves[1].reason).toBe("Water damage");
    });

    it("rejects no-op, invalid and untracked adjustments", async () => {
      const noop = await admin
        .post("/inventory/adjustments", {
          variant_id: variantId,
          mode: "set",
          quantity: 4,
          reason: "correction",
        })
        .expect(422);
      expect(noop.body.error.code).toBe("INVENTORY_NO_CHANGE");
      await admin
        .post("/inventory/adjustments", { variant_id: variantId, quantity: 2, reason: "other" })
        .expect(422);
      await admin
        .post("/inventory/adjustments", { variant_id: variantId, quantity: 2 })
        .expect(422);
      const { body } = await admin
        .post("/products", { title: `Untracked ${RUN}`, inventory_tracking: false })
        .expect(201);
      const untracked = await admin
        .post("/inventory/adjustments", {
          variant_id: body.data.variants[0].id,
          quantity: 1,
          reason: "received",
        })
        .expect(422);
      expect(untracked.body.error.code).toBe("INVENTORY_NOT_TRACKED");
      expect(body.data.variants[0].inventory.state).toBe("untracked");
    });

    it("enforces permissions: catalog/order managers read, only adjusters write", async () => {
      await catalog.get("/inventory").expect(200);
      await orders.get("/inventory").expect(200);
      await catalog
        .post("/inventory/adjustments", { variant_id: variantId, quantity: 1, reason: "received" })
        .expect(403);
      await ownerSecond
        .post("/inventory/adjustments", { variant_id: variantId, quantity: 1, reason: "received" })
        .expect(404);
    });

    it("serializes concurrent adjustments: no lost updates (§9.3)", async () => {
      const before = (
        await admin.get(`/inventory?q=${encodeURIComponent(`LED-${RUN}`)}`).expect(200)
      ).body.data[0].on_hand;
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          admin.post("/inventory/adjustments", {
            variant_id: variantId,
            quantity: 1,
            reason: "received",
          }),
        ),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      const after = (
        await admin.get(`/inventory?q=${encodeURIComponent(`LED-${RUN}`)}`).expect(200)
      ).body.data[0].on_hand;
      expect(after).toBe(before + 20);
      const moves = await prisma.stockMovement.findMany({
        where: { variant_id: variantId, movement_type: "received", quantity_delta: 1 },
      });
      const afters = moves.map((m) => m.quantity_after).sort((a, b) => a - b);
      expect(new Set(afters).size).toBe(afters.length); // every movement saw a distinct, sequential state
      expect(afters.at(-1)).toBe(after);
    });

    it("keeps the movement ledger immutable at the database level", async () => {
      const m = await prisma.stockMovement.findFirstOrThrow({ where: { variant_id: variantId } });
      await expect(
        prisma.stockMovement.update({ where: { id: m.id }, data: { quantity_delta: 999 } }),
      ).rejects.toThrow(/append-only/);
      await expect(prisma.stockMovement.delete({ where: { id: m.id } })).rejects.toThrow(
        /append-only/,
      );
    });

    it("filters low and out-of-stock items", async () => {
      const { body } = await admin
        .post("/products", { title: `Empty ${RUN}`, sku: `EMP-${RUN}` })
        .expect(201);
      const out = (await admin.get(`/inventory?stock=out&q=${encodeURIComponent(RUN)}`).expect(200))
        .body.data;
      expect(out.map((r: { variant_id: string }) => r.variant_id)).toContain(
        body.data.variants[0].id,
      );
      const low = await admin
        .post("/products", {
          title: `Low ${RUN}`,
          sku: `LOW-${RUN}`,
          inventory_quantity: 2,
          low_stock_threshold: 5,
        })
        .expect(201);
      const lows = (
        await admin.get(`/inventory?stock=low&q=${encodeURIComponent(RUN)}`).expect(200)
      ).body.data;
      expect(lows.map((r: { variant_id: string }) => r.variant_id)).toEqual([
        low.body.data.variants[0].id,
      ]);
    });
  });
});
