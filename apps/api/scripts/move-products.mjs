#!/usr/bin/env node
/**
 * Moves (or copies) every product from one store to another through the real
 * admin API: validation, audit log and storefront refresh all apply.
 *
 * Copied: title, description, vendor, tags, SEO, prices, cost, SKU/barcode,
 * stock, options and variants, images (re-uploaded), categories and collections
 * (created in the target store when missing, matched by name).
 * Not copied: orders and reviews (they stay with the original store).
 *
 * Usage (passwords are asked for and never shown):
 *
 *   FROM_STORE=harbor FROM_EMAIL=owner@cartforge.test \
 *   TO_STORE=silsilastudio TO_EMAIL=you@example.com \
 *   node apps/api/scripts/move-products.mjs
 *
 * Options (environment variables):
 *   CF_API       Site address. Default https://cartforge-app.vercel.app
 *   MODE         move (default): copy, then archive the originals · copy: leave the originals
 *   DRY_RUN=1    Only list what would happen
 *   PRICE_RATE   Required when the stores use different currencies: every price is
 *                multiplied by it (e.g. 1.08 for EUR → USD). PRICE_RATE=1 keeps the numbers.
 *   FROM_PASSWORD / TO_PASSWORD  Skip the prompt (avoid: they end up in shell history)
 *
 * Safe to re-run: products already in the target store (same handle) are skipped,
 * and originals are archived only after their copy exists.
 */
import { createInterface } from "node:readline";

const API = (process.env.CF_API ?? "https://cartforge-app.vercel.app").replace(/\/+$/, "");
const ORIGIN =
  process.env.CF_ORIGIN ?? (API.includes("localhost:4000") ? "http://localhost:3000" : API);
const MODE = (process.env.MODE ?? "move").toLowerCase();
const DRY_RUN = process.env.DRY_RUN === "1";

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}
if (!["move", "copy"].includes(MODE)) fail("MODE must be move or copy.");
for (const k of ["FROM_STORE", "FROM_EMAIL", "TO_STORE", "TO_EMAIL"])
  if (!process.env[k]) fail(`Set ${k}. See the top of this file for an example.`);

// ───────────── Prompt (hidden input) ─────────────

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

// ───────────── API client ─────────────

class Session {
  constructor(email) {
    this.email = email;
    this.cookie = "";
    this.csrf = "";
    this.storeId = "";
  }

  async login(password) {
    const res = await fetch(`${API}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email: this.email, password }),
    });
    if (res.status === 401) fail(`Wrong email or password for ${this.email}.`);
    if (!res.ok) fail(`Sign-in failed for ${this.email} (${res.status}).`);
    const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
    this.cookie = cookies.join("; ");
    this.csrf = cookies.find((c) => c.startsWith("cf_csrf=")).split("=")[1];
  }

  async useStore(handle) {
    const me = await this.call("GET", "/auth/me", undefined, { noStore: true });
    const s = me.stores.find((x) => x.store_handle === handle);
    if (!s) {
      const mine = me.stores.map((x) => x.store_handle).join(", ") || "none";
      fail(`${this.email} has no store "${handle}". Their stores: ${mine}.`);
    }
    if (s.store_status !== "active") fail(`Store "${handle}" is suspended.`);
    this.storeId = s.store_id;
    this.storeName = s.store_name;
  }

  async call(method, path, body, { raw = false, noStore = false } = {}) {
    const headers = { cookie: this.cookie, origin: ORIGIN };
    if (!noStore) headers["x-store-id"] = this.storeId;
    if (method !== "GET") headers["x-csrf-token"] = this.csrf;
    if (body !== undefined && !raw) headers["content-type"] = "application/json";
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`${API}/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return json.data;
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json.error ?? json)}`);
    }
  }

  async all(path) {
    const out = [];
    for (let page = 1; ; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const res = await fetch(`${API}/api/v1${path}${sep}page=${page}&page_size=100`, {
        headers: { cookie: this.cookie, origin: ORIGIN, "x-store-id": this.storeId },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${JSON.stringify(json.error)}`);
      out.push(...json.data);
      if (!json.meta || page >= json.meta.total_pages) return out;
    }
  }
}

// ───────────── Helpers ─────────────

let rate = 1;
const price = (v) => (v == null ? v : Math.round(v * rate));

async function copyImage(to, item) {
  const url = new URL(item.url, API).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed (${res.status}): ${url}`);
  const type = res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "image");
  const form = new FormData();
  form.set("file", new Blob([await res.arrayBuffer()], { type }), name);
  if (item.alt_text) form.set("alt_text", item.alt_text);
  return to.call("POST", "/media", form, { raw: true });
}

const variantKey = (v) =>
  v.option_values
    .map((o) => `${o.option}=${o.value}`.toLowerCase())
    .sort()
    .join("|");

// ───────────── Main ─────────────

async function main() {
  console.log(`CartForge — ${MODE} products${DRY_RUN ? " (dry run)" : ""} on ${API}\n`);
  const from = new Session(process.env.FROM_EMAIL.trim().toLowerCase());
  const to = new Session(process.env.TO_EMAIL.trim().toLowerCase());

  await from.login(process.env.FROM_PASSWORD ?? (await askHidden(`Password for ${from.email}: `)));
  if (to.email === from.email) Object.assign(to, { cookie: from.cookie, csrf: from.csrf });
  else await to.login(process.env.TO_PASSWORD ?? (await askHidden(`Password for ${to.email}: `)));
  await from.useStore(process.env.FROM_STORE.trim().toLowerCase());
  await to.useStore(process.env.TO_STORE.trim().toLowerCase());
  if (from.storeId === to.storeId) fail("FROM_STORE and TO_STORE are the same store.");

  const [fromInfo, toInfo] = await Promise.all(
    [from, to].map((s) => s.call("GET", "/storefront/store")),
  );
  if (fromInfo.currency !== toInfo.currency) {
    if (!process.env.PRICE_RATE)
      fail(
        `${from.storeName} uses ${fromInfo.currency} but ${to.storeName} uses ${toInfo.currency}.\n` +
          `  Set PRICE_RATE: the number every price is multiplied by (${fromInfo.currency} → ${toInfo.currency}),\n` +
          `  or PRICE_RATE=1 to keep the same numbers.`,
      );
    rate = Number(process.env.PRICE_RATE);
    if (!(rate > 0)) fail("PRICE_RATE must be a positive number.");
    console.log(`Prices: ${fromInfo.currency} × ${rate} → ${toInfo.currency}`);
  }

  const products = await from.all("/products?status=draft,active&sort=created_at&order=asc");
  console.log(`From: ${from.storeName} — ${products.length} product(s)`);
  console.log(`To:   ${to.storeName}\n`);
  if (!products.length) return;

  // Categories and collections in the target, matched by name / title.
  const [srcCats, dstCats, dstCols] = await Promise.all([
    from.call("GET", "/categories"),
    to.call("GET", "/categories"),
    to.all("/collections"),
  ]);
  const catByPath = new Map(dstCats.map((c) => [c.path.toLowerCase(), c.id]));
  const colByTitle = new Map(dstCols.map((c) => [c.title.toLowerCase(), c.id]));
  const srcCatById = new Map(srcCats.map((c) => [c.id, c]));

  async function targetCategory(srcId) {
    const c = srcCatById.get(srcId);
    if (!c) return undefined;
    const key = c.path.toLowerCase();
    if (catByPath.has(key)) return catByPath.get(key);
    const parent = c.parent_id ? await targetCategory(c.parent_id) : null;
    if (DRY_RUN) return `new:${key}`;
    const made = await to.call("POST", "/categories", {
      name: c.name,
      parent_id: parent ?? null,
      description_html: c.description_html,
      seo_title: c.seo_title,
      seo_description: c.seo_description,
    });
    console.log(`  + category ${c.path}`);
    catByPath.set(key, made.id);
    return made.id;
  }

  async function targetCollection(src) {
    const key = src.title.toLowerCase();
    if (colByTitle.has(key)) return colByTitle.get(key);
    if (DRY_RUN) return `new:${key}`;
    const full = await from.call("GET", `/collections/${src.id}`);
    const made = await to.call("POST", "/collections", {
      title: full.title,
      description_html: full.description_html,
      status: full.status === "archived" ? "draft" : full.status,
      sort_order: full.sort_order,
      seo_title: full.seo_title,
      seo_description: full.seo_description,
    });
    console.log(`  + collection ${full.title}`);
    colByTitle.set(key, made.id);
    return made.id;
  }

  let copied = 0;
  let skipped = 0;
  let archived = 0;
  const problems = [];

  for (const item of products) {
    const p = await from.call("GET", `/products/${item.id}`);
    const label = `${p.title} (${p.status}, ${p.variants.length} variant${p.variants.length === 1 ? "" : "s"})`;
    try {
      const existing = (await to.all(`/products?q=${encodeURIComponent(p.handle)}`)).find(
        (x) => x.handle === p.handle,
      );
      if (existing) {
        console.log(`= ${label} — already in ${to.storeName}, skipped`);
        skipped++;
      } else if (DRY_RUN) {
        console.log(`→ ${label} — would copy ${p.media.length} image(s)`);
      } else {
        await copyProduct(p);
        console.log(`+ ${label}`);
        copied++;
      }
      if (MODE === "move" && !DRY_RUN) {
        await from.call("POST", `/products/${p.id}/archive`);
        console.log(`  archived in ${from.storeName}`);
        archived++;
      }
    } catch (err) {
      problems.push(`${p.title}: ${err.message}`);
      console.log(`✖ ${label} — ${err.message}`);
    }
  }

  async function copyProduct(p) {
    // Images first; ids map old asset → new asset.
    const media = new Map();
    for (const m of p.media) media.set(m.media_asset_id, (await copyImage(to, m)).id);
    const primary = p.media.find((m) => m.is_primary)?.media_asset_id;

    const category_ids = [];
    for (const c of p.categories) {
      const id = await targetCategory(c.id);
      if (id) category_ids.push(id);
    }
    const collection_ids = [];
    for (const c of p.collections) collection_ids.push(await targetCollection(c));

    const simple = p.product_type === "simple";
    const d = p.variants[0];
    const created = await to.call("POST", "/products", {
      title: p.title,
      handle: p.handle,
      description_html: p.description_html,
      vendor: p.vendor ?? undefined,
      status: "draft",
      taxable: p.taxable,
      tags: p.tags,
      seo_title: p.seo_title,
      seo_description: p.seo_description,
      category_ids,
      collection_ids,
      media: p.media.map((m) => ({
        media_asset_id: media.get(m.media_asset_id),
        alt_text: m.alt_text,
      })),
      primary_media_id: primary ? media.get(primary) : undefined,
      ...(simple && d
        ? {
            price_minor: price(d.price_minor),
            compare_at_minor: price(d.compare_at_minor),
            cost_minor: price(d.cost_minor),
            sku: d.sku,
            barcode: d.barcode,
            inventory_tracking: d.inventory_tracking,
            continue_selling: d.continue_selling,
            low_stock_threshold: d.inventory.low_stock_threshold,
            ...(d.inventory_tracking && d.inventory.on_hand > 0
              ? { inventory_quantity: d.inventory.on_hand }
              : {}),
          }
        : {}),
    });

    if (!simple) {
      const options = [...p.options]
        .sort((a, b) => a.position - b.position)
        .map((o) => ({
          name: o.name,
          values: [...o.values].sort((a, b) => a.position - b.position).map((v) => v.value),
        }));
      await to.call("PUT", `/products/${created.id}/options`, { options });
      const detail = await to.call("GET", `/products/${created.id}`);
      const byKey = new Map(detail.variants.map((v) => [variantKey(v), v]));
      for (const sv of p.variants) {
        const tv = byKey.get(variantKey(sv));
        if (!tv) throw new Error(`variant "${sv.title}" missing after copying options`);
        await to.call("PATCH", `/variants/${tv.id}`, {
          sku: sv.sku,
          barcode: sv.barcode,
          price_minor: price(sv.price_minor),
          compare_at_minor: price(sv.compare_at_minor),
          cost_minor: price(sv.cost_minor),
          inventory_tracking: sv.inventory_tracking,
          continue_selling: sv.continue_selling,
          low_stock_threshold: sv.inventory.low_stock_threshold,
          media_asset_id: sv.media_asset_id ? (media.get(sv.media_asset_id) ?? null) : null,
        });
        if (sv.inventory_tracking && sv.inventory.on_hand > 0)
          await to.call("POST", "/inventory/adjustments", {
            variant_id: tv.id,
            mode: "set",
            quantity: sv.inventory.on_hand,
            reason: "received",
          });
      }
    }
    if (p.status === "active") await to.call("POST", `/products/${created.id}/publish`);
  }

  console.log(
    `\nDone. Copied ${copied}, already there ${skipped}` +
      (MODE === "move" ? `, archived in ${from.storeName} ${archived}` : "") +
      (problems.length ? `, failed ${problems.length}` : "") +
      ".",
  );
  if (problems.length) {
    console.log("\nNot moved (nothing was archived for these):");
    for (const x of problems) console.log(`  - ${x}`);
    console.log("Fix the cause and run the script again; finished products are skipped.");
    process.exitCode = 1;
  }
}

main().catch((err) => fail(err.message));
