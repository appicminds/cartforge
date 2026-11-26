#!/usr/bin/env node
/**
 * Regenerates the theme thumbnails shown in Admin → Online store
 * (apps/admin/public/theme-previews/<preset>.webp).
 *
 * Needs the local stack running (api :4000, storefront :3100) with the dev seed.
 * Works in its own "Lumen Studio" store (created on first run), filled with the
 * sample products of the theme that has them. Each preset is added there as an
 * unpublished theme, given the sample banner pictures, opened through a preview
 * link and photographed, then deleted.
 *
 *   node scripts/theme-thumbnails.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const sharp = require(
  join(dirname(fileURLToPath(import.meta.url)), "../apps/api/node_modules/sharp"),
);

const API = process.env.API_URL ?? "http://localhost:4000/api/v1";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3100";
const ADMIN = process.env.ADMIN_URL ?? "http://localhost:3000";
const OUT =
  process.env.OUT_DIR ??
  join(dirname(fileURLToPath(import.meta.url)), "../apps/admin/public/theme-previews");
/** SCALE=2 makes sharper, larger pictures (the marketing site uses 1600 px wide). */
const SCALE = Number(process.env.SCALE ?? 1);
mkdirSync(OUT, { recursive: true });

const login = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: ADMIN },
  body: JSON.stringify({
    email: "owner@cartforge.test",
    password: process.env.SEED_PASSWORD ?? "CartForge!dev1",
  }),
});
if (!login.ok) throw new Error(`Sign-in failed (${login.status})`);
const cookies = login.headers.getSetCookie().map((c) => c.split(";")[0]);
const csrf = cookies.find((c) => c.startsWith("cf_csrf=")).split("=")[1];
const base = {
  "content-type": "application/json",
  cookie: cookies.join("; "),
  "x-csrf-token": csrf,
  origin: ADMIN,
};
const call = async (store, method, path, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { ...base, ...(store ? { "x-store-id": store } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : (await r.json()).data;
};

/** The store used for themes with sample products (created once, then reused). */
async function sampleStore() {
  const find = async () =>
    (await call(null, "GET", "/auth/me")).stores.find((s) => s.store_name === "Lumen Studio");
  const found =
    (await find()) ??
    (await call(null, "POST", "/stores", { store_name: "Lumen Studio", currency: "PKR" }),
    await find());
  return { id: found.store_id, handle: found.store_handle };
}

const store = await sampleStore();
const presets = await call(store.id, "GET", "/themes/presets");
const kit = presets.find((p) => p.has_sample_content);
// Make room (the library holds six themes): drop thumbnails left by an earlier run.
for (const t of await call(store.id, "GET", "/themes"))
  if (t.role !== "live" && t.name.endsWith(" thumbnail"))
    await call(store.id, "DELETE", `/themes/${t.id}`);

/** Every theme is shown with the same sample catalog and banner pictures. */
const source = await call(store.id, "POST", "/themes", {
  preset: kit.key,
  name: `${kit.name} thumbnail`,
});
for (let i = 0; i < 10; i++)
  if ((await call(store.id, "POST", `/themes/${source.id}/sample-content`, {})).done) break;
const sourceData = (await call(store.id, "GET", `/themes/${source.id}`)).data;
const pictures = sourceData.templates.home
  .flatMap((s) => [s.settings.image, ...s.blocks.map((b) => b.settings.image)])
  .filter(Boolean);

/** Fills empty slideshow and image-with-text pictures with the sample ones. */
function withPictures(data) {
  let i = 0;
  const next = () => pictures[i++ % pictures.length];
  for (const s of data.templates.home) {
    if (s.type === "slideshow") for (const b of s.blocks) b.settings.image ??= next();
    if (s.type === "image_with_text") s.settings.image ??= next();
  }
  return data;
}

const browser = await chromium.launch();
try {
  for (const p of presets) {
    const theme =
      p.key === kit.key
        ? source
        : await call(store.id, "POST", "/themes", { preset: p.key, name: `${p.name} thumbnail` });
    try {
      if (theme !== source) {
        const data = (await call(store.id, "GET", `/themes/${theme.id}`)).data;
        await call(store.id, "PUT", `/themes/${theme.id}/data`, { data: withPictures(data) });
      }
      const { token } = await call(store.id, "POST", `/themes/${theme.id}/preview-link`, {});
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1040 },
        deviceScaleFactor: SCALE,
      });
      await page.goto(`${SF}/?store=${store.handle}`);
      await page.goto(`${SF}/?theme_preview=${token}`);
      await page.waitForLoadState("networkidle");
      // The preview bars aren't part of the theme.
      await page.addStyleTag({
        content:
          "[data-testid=preview-bar],[data-testid=theme-preview-bar]{display:none!important}",
      });
      await page.waitForTimeout(1200);
      const shot = await page.screenshot();
      await sharp(shot)
        .resize(800 * SCALE, 650 * SCALE)
        .webp({ quality: 80 })
        .toFile(join(OUT, `${p.key}.webp`));
      await page.close();
      console.log(`✓ ${p.key}`);
    } finally {
      if (theme !== source) await call(store.id, "DELETE", `/themes/${theme.id}`);
    }
  }
} finally {
  await call(store.id, "DELETE", `/themes/${source.id}`);
  await browser.close();
}
