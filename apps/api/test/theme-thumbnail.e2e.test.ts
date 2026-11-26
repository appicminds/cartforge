import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createTestApp, login, RUN } from "./app";

/** Pictures of themes for the theme library, sent by the editor after changes. */
describe("theme thumbnails", () => {
  let app: INestApplication;
  let edition: string | undefined;
  let owner: ReturnType<typeof api>;
  let session: Awaited<ReturnType<typeof login>>;
  let storeId = "";
  const http = () => request(app.getHttpServer());
  const upload = (themeId: string, file: Buffer, name = "home.png") =>
    http()
      .put(`/api/v1/themes/${themeId}/thumbnail`)
      .set("Cookie", session.cookies)
      .set("X-Store-Id", storeId)
      .set("X-CSRF-Token", session.csrf)
      .attach("file", file, name);
  const picture = (r: number) =>
    sharp({ create: { width: 1280, height: 800, channels: 3, background: { r, g: 120, b: 90 } } })
      .png()
      .toBuffer();

  beforeAll(async () => {
    edition = process.env.CARTFORGE_EDITION;
    process.env.CARTFORGE_EDITION = "saas";
    app = await createTestApp();
    session = await login(app, "other@cartforge.test");
    storeId = (
      await http()
        .post("/api/v1/stores")
        .set("Cookie", session.cookies)
        .set("X-CSRF-Token", session.csrf)
        .send({ store_name: `Thumbs ${RUN}`, currency: "PKR" })
        .expect(201)
    ).body.data.store_id;
    owner = api(app, session, storeId);
  });

  afterAll(async () => {
    if (edition === undefined) delete process.env.CARTFORGE_EDITION;
    else process.env.CARTFORGE_EDITION = edition;
    await app.close();
  });

  it("stores a resized picture without counting it as an edit; copies and deletes it with the theme", async () => {
    const theme = (await owner.post("/themes", { preset: "noor" }).expect(201)).body.data;
    expect(theme.thumbnail_url).toBeNull();

    const saved = (await upload(theme.id, await picture(10)).expect(200)).body.data;
    expect(saved.thumbnail_url).toMatch(/theme-thumbnails\/[0-9a-f]{64}\.webp$/);
    expect(saved.updated_at).toBe(theme.updated_at);

    const list = (await owner.get("/themes").expect(200)).body.data;
    expect(list.find((t: { id: string }) => t.id === theme.id).thumbnail_url).toBe(
      saved.thumbnail_url,
    );

    // A new picture replaces the old one.
    const next = (await upload(theme.id, await picture(200)).expect(200)).body.data;
    expect(next.thumbnail_url).not.toBe(saved.thumbnail_url);

    // A copy of the theme keeps the picture.
    const copy = (await owner.post(`/themes/${theme.id}/duplicate`, {}).expect(201)).body.data;
    expect(copy.thumbnail_url).toBe(next.thumbnail_url);
    await owner.delete(`/themes/${copy.id}`).expect(204);
    await owner.delete(`/themes/${theme.id}`).expect(204);
  });

  it("refuses files that aren't pictures", async () => {
    const theme = (await owner.post("/themes", { preset: "minimal" }).expect(201)).body.data;
    const res = await upload(theme.id, Buffer.from("<svg onload=alert(1)>"), "x.svg").expect(422);
    expect(res.body.error.fields[0].path).toBe("file");
    await owner.delete(`/themes/${theme.id}`).expect(204);
  });
});
