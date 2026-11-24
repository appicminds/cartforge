import { createHash, randomBytes } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEED_STORES } from "@cartforge/database/seed";
import { api, createTestApp, login, RUN, type Session } from "./app";

const MAIN = SEED_STORES.main.id;
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Bytes that start like an MP4 (an `ftyp` box), then noise. Not playable, but typed right. */
const fakeMp4 = () =>
  Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from("ftypmp42", "latin1"),
    Buffer.alloc(12),
    randomBytes(4096),
  ]);

describe("product videos", () => {
  let app: INestApplication;
  let session: Session;
  let catalog: ReturnType<typeof api>;
  let orders: ReturnType<typeof api>;
  let poster: Buffer;

  const complete = (
    fields: Record<string, string | number>,
    files: { poster?: Buffer; file?: Buffer },
    s: Session = session,
  ) => {
    let r = request(app.getHttpServer())
      .post("/api/v1/media/videos")
      .set("Cookie", s.cookies)
      .set("X-Store-Id", MAIN)
      .set("X-CSRF-Token", s.csrf);
    for (const [k, v] of Object.entries(fields)) r = r.field(k, String(v));
    if (files.poster) r = r.attach("poster", files.poster, "poster.jpg");
    if (files.file) r = r.attach("file", files.file, "clip.mp4");
    return r;
  };

  const fields = (video: Buffer, extra: Record<string, string | number> = {}) => ({
    filename: `clip-${RUN}.mp4`,
    mime_type: "video/mp4",
    checksum_sha256: sha(video),
    width: 1080,
    height: 1920,
    duration_ms: 12_500,
    ...extra,
  });

  beforeAll(async () => {
    app = await createTestApp();
    session = await login(app, "catalog@cartforge.test");
    catalog = api(app, session, MAIN);
    orders = api(app, await login(app, "orders@cartforge.test"), MAIN);
    poster = await sharp({
      create: { width: 540, height: 960, channels: 3, background: { r: 120, g: 40, b: 60 } },
    })
      .jpeg()
      .toBuffer();
  });
  afterAll(async () => {
    await app.close();
  });

  it("uploads a video through the API (local storage), with a cover frame", async () => {
    const video = fakeMp4();
    const start = await catalog
      .post("/media/videos/uploads", {
        filename: "clip.mp4",
        mime_type: "video/mp4",
        size_bytes: video.length,
        checksum_sha256: sha(video),
      })
      .expect(200);
    expect(start.body.data).toEqual({ asset: null, upload: { strategy: "api" } });

    const res = await complete(fields(video, { alt_text: "Model twirling" }), {
      poster,
      file: video,
    }).expect(201);
    const a = res.body.data;
    expect(a).toMatchObject({
      media_type: "video",
      mime_type: "video/mp4",
      duration_ms: 12_500,
      width: 1080,
      height: 1920,
      size_bytes: video.length,
      alt_text: "Model twirling",
    });
    expect(a.video_url).toMatch(/\/original\.mp4$/);
    expect(a.url).toMatch(/\/poster\.jpg$/); // always an image
    expect(a.thumb_url).toMatch(/\/thumb\.webp$/);

    const file = await request(app.getHttpServer()).get(a.video_url).buffer(true).expect(200);
    expect(sha(file.body as Buffer)).toBe(sha(video));

    // Same file again: the existing asset comes back, nothing is uploaded.
    const again = await catalog
      .post("/media/videos/uploads", {
        filename: "copy.mp4",
        mime_type: "video/mp4",
        size_bytes: video.length,
        checksum_sha256: sha(video),
      })
      .expect(200);
    expect(again.body.data.asset).toMatchObject({ id: a.id, deduplicated: true });
    expect(again.body.data.upload).toBeNull();

    // Library filter.
    const vids = (await catalog.get("/media?type=video&page_size=100").expect(200)).body.data;
    expect(vids.map((x: { id: string }) => x.id)).toContain(a.id);
    expect(vids.every((x: { media_type: string }) => x.media_type === "video")).toBe(true);
    const imgs = (await catalog.get("/media?type=image&page_size=100").expect(200)).body.data;
    expect(imgs.map((x: { id: string }) => x.id)).not.toContain(a.id);
  });

  it("plays in the storefront gallery and keeps product thumbnails as images", async () => {
    const video = fakeMp4();
    const asset = (await complete(fields(video), { poster, file: video }).expect(201)).body.data;
    const p = (
      await catalog
        .post("/products", {
          title: `Video suit ${RUN}`,
          price_minor: 5000,
          status: "active",
          inventory_tracking: false,
          media: [{ media_asset_id: asset.id }],
        })
        .expect(201)
    ).body.data;
    expect(p.media[0]).toMatchObject({ media_type: "video", video_url: asset.video_url });
    const listed = (
      await catalog.get(`/products?q=${encodeURIComponent(`Video suit ${RUN}`)}`).expect(200)
    ).body.data[0];
    expect(listed.thumbnail_url).toMatch(/thumb\.webp$/);

    const shop = await request(app.getHttpServer())
      .get(`/api/v1/storefront/products/${p.handle}`)
      .set("X-Store-Id", MAIN)
      .expect(200);
    const img = shop.body.data.images[0];
    expect(img.url).toBe(asset.url);
    expect(img.video).toEqual({
      url: asset.video_url,
      mime_type: "video/mp4",
      duration_ms: 12_500,
    });
  });

  it("rejects files that aren't videos, missing covers and oversize uploads", async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const disguised = await complete(fields(png), { poster, file: png }).expect(422);
    expect(disguised.body.error.code).toBe("MEDIA_INVALID_FILE");

    const video = fakeMp4();
    const noPoster = await complete(fields(video), { file: video }).expect(422);
    expect(noPoster.body.error.fields[0].path).toBe("poster");

    const badPoster = await complete(fields(video), { poster: video, file: video }).expect(422);
    expect(badPoster.body.error.fields[0].path).toBe("poster");

    const huge = await catalog
      .post("/media/videos/uploads", {
        filename: "huge.mp4",
        mime_type: "video/mp4",
        size_bytes: 5 * 1024 * 1024 * 1024,
        checksum_sha256: sha(video),
      })
      .expect(413);
    expect(huge.body.error.code).toBe("MEDIA_TOO_LARGE");

    const wrongType = await catalog
      .post("/media/videos/uploads", {
        filename: "x.avi",
        mime_type: "video/x-msvideo",
        size_bytes: 10,
        checksum_sha256: sha(video),
      })
      .expect(422);
    expect(wrongType.body.error.code).toBe("VALIDATION_FAILED");

    // Without the file and nothing uploaded to storage: told to retry.
    const missing = await complete(fields(fakeMp4()), { poster }).expect(422);
    expect(missing.body.error.message).toMatch(/didn't finish uploading/);
  });

  it("needs media.write", async () => {
    await orders
      .post("/media/videos/uploads", {
        filename: "clip.mp4",
        mime_type: "video/mp4",
        size_bytes: 10,
        checksum_sha256: "0".repeat(64),
      })
      .expect(403);
  });
});
