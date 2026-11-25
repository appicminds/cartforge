import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@cartforge/database";
import { api, createTestApp, login, RUN } from "./app";
import { TEST_ENV } from "./test-env";

/** "Add sample products" for the Noor theme: collections, products, pictures, banners. */
describe("theme sample content", () => {
  let app: INestApplication;
  let edition: string | undefined;
  let owner: ReturnType<typeof api>;
  let storeId = "";
  let themeId = "";
  const prisma = createPrismaClient(TEST_ENV.DATABASE_URL);
  const http = () => request(app.getHttpServer());

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
        .send({ store_name: `Samples ${RUN}`, currency: "PKR" })
        .expect(201)
    ).body.data.store_id;
    owner = api(app, merchant, storeId);
    themeId = (await owner.post("/themes", { preset: "noor" }).expect(201)).body.data.id;
  }, 60_000);

  afterAll(async () => {
    if (edition === undefined) delete process.env.CARTFORGE_EDITION;
    else process.env.CARTFORGE_EDITION = edition;
    await prisma.$disconnect();
    await app.close();
  });

  it("adds the collections, products and banner pictures, in steps, and only once", async () => {
    const before = (await owner.get(`/themes/${themeId}/sample-content`).expect(200)).body.data;
    expect(before).toMatchObject({ done: false, products_added: 0, products_total: 25 });

    let progress = before;
    for (let i = 0; i < 10 && !progress.done; i++)
      progress = (await owner.post(`/themes/${themeId}/sample-content`, {}).expect(200)).body.data;
    expect(progress).toMatchObject({ done: true, products_added: 25 });

    const products = await prisma.product.findMany({
      where: { store_id: storeId, deleted_at: null },
      include: { variants: { where: { deleted_at: null } }, media: true },
    });
    expect(products).toHaveLength(25);
    const nida = products.find((p) => p.handle === "classic-black-nida-abaya")!;
    expect(nida).toMatchObject({ status: "active", product_type: "variable" });
    expect(nida.variants).toHaveLength(30);
    expect(nida.variants.every((v) => v.price_minor === 8_500n && !v.inventory_tracking)).toBe(
      true,
    );
    expect(nida.media).toHaveLength(2);
    const hijab = products.find((p) => p.handle === "premium-chiffon-hijab-black")!;
    expect(hijab.variants).toHaveLength(1);
    const sale = products.find((p) => p.handle === "teal-crepe-abaya")!;
    expect(sale.variants[0]!.compare_at_minor).toBe(12_000n);

    const best = await prisma.collection.findFirstOrThrow({
      where: { store_id: storeId, handle: "best-sellers" },
      include: { products: true },
    });
    expect(best.status).toBe("active");
    expect(best.products.length).toBeGreaterThanOrEqual(8);

    // Banners went into the theme's empty picture slots.
    const theme = (await owner.get(`/themes/${themeId}`).expect(200)).body.data;
    const home = theme.data.templates.home;
    const slides = home.find((s: { type: string }) => s.type === "slideshow").blocks;
    expect(slides.every((b: { settings: { image: string | null } }) => b.settings.image)).toBe(
      true,
    );
    expect(
      home.find((s: { type: string }) => s.type === "image_with_text").settings.image,
    ).toBeTruthy();

    // The storefront shows them.
    const listed = await http()
      .get("/api/v1/storefront/collections/best-sellers")
      .set("X-Store-Id", storeId)
      .expect(200);
    expect(JSON.stringify(listed.body)).toContain("Classic Black Nida Abaya");

    // Running it again changes nothing.
    const again = (await owner.post(`/themes/${themeId}/sample-content`, {}).expect(200)).body.data;
    expect(again).toMatchObject({ done: true, products_added: 25 });
    expect(await prisma.product.count({ where: { store_id: storeId, deleted_at: null } })).toBe(25);
  }, 240_000);

  it("is only offered by themes that have sample content", async () => {
    const minimal = (await owner.post("/themes", { preset: "minimal" }).expect(201)).body.data.id;
    await owner.post(`/themes/${minimal}/sample-content`, {}).expect(422);
  });
});
