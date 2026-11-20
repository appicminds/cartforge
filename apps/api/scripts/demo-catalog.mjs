#!/usr/bin/env node
/**
 * Fills a demo store with a small, good-looking catalog through the real admin
 * API (uploads, validation, audit log, storefront purge — nothing bypassed).
 * Idempotent: anything that already exists (matched by name/title) is skipped.
 *
 *   DEMO_API=https://cartforge-app.vercel.app DEMO_EMAIL=owner@… DEMO_PASSWORD=… \
 *   DEMO_STORE_ID=00000000-0000-4000-8000-000000000001 node apps/api/scripts/demo-catalog.mjs
 *
 * Product images are simple illustrations drawn here as SVG and rendered to PNG.
 */
import sharp from "sharp";

const API = (process.env.DEMO_API ?? "http://localhost:4000").replace(/\/+$/, "");
const ORIGIN =
  process.env.DEMO_ORIGIN ?? (API.includes("localhost") ? "http://localhost:3000" : API);
const STORE = process.env.DEMO_STORE_ID ?? "00000000-0000-4000-8000-000000000001";
const EMAIL = process.env.DEMO_EMAIL ?? "owner@cartforge.test";
const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD) {
  console.error("Set DEMO_PASSWORD (the demo owner's password).");
  process.exit(1);
}
const VENDOR = "Northwind Studio";

// ───────────── API client ─────────────

let cookie = "";
let csrf = "";

async function login() {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status})`);
  const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
  cookie = cookies.join("; ");
  csrf = cookies.find((c) => c.startsWith("cf_csrf=")).split("=")[1];
}

async function call(method, path, body, raw = false) {
  const headers = { cookie, "x-store-id": STORE, origin: ORIGIN };
  if (method !== "GET") headers["x-csrf-token"] = csrf;
  if (body !== undefined && !raw) headers["content-type"] = "application/json";
  const res = await fetch(`${API}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json.error ?? json)}`);
  return json.data;
}

// ───────────── Illustrations ─────────────

const W = 1200;
const H = 1500;
const frame = (
  bg,
  inner,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <ellipse cx="600" cy="1180" rx="330" ry="38" fill="#000" opacity="0.08"/>
  ${inner}
</svg>`;

const ART = {
  mug: (c) =>
    frame(
      "#ece6dd",
      `
    <path d="M820 620 h40 a110 110 0 0 1 0 220 h-40" fill="none" stroke="${c}" stroke-width="44"/>
    <rect x="370" y="520" width="470" height="660" rx="48" fill="${c}"/>
    <rect x="370" y="520" width="470" height="60" rx="30" fill="#000" opacity="0.12"/>
    <path d="M520 470 q-30 -60 0 -120 q30 -60 0 -120" fill="none" stroke="#fff" stroke-width="14" opacity="0.7" stroke-linecap="round"/>
    <path d="M660 470 q-30 -60 0 -120 q30 -60 0 -120" fill="none" stroke="#fff" stroke-width="14" opacity="0.5" stroke-linecap="round"/>`,
    ),
  pourover: () =>
    frame(
      "#e3e8e4",
      `
    <path d="M380 820 h440 l-40 340 a40 40 0 0 1 -40 30 h-280 a40 40 0 0 1 -40 -30 z" fill="#dfe9ee" stroke="#2d3b3a" stroke-width="10" opacity="0.9"/>
    <rect x="420" y="1010" width="360" height="150" rx="20" fill="#5b3a1e" opacity="0.85"/>
    <path d="M360 430 h480 l-170 360 h-140 z" fill="#f4efe8" stroke="#2d3b3a" stroke-width="10"/>
    <rect x="520" y="790" width="160" height="40" rx="10" fill="#2d3b3a"/>
    <path d="M440 470 l120 260 M760 470 l-120 260" stroke="#2d3b3a" stroke-width="6" opacity="0.25"/>`,
    ),
  towel: () =>
    frame(
      "#efe9df",
      `
    <rect x="300" y="420" width="600" height="760" rx="18" fill="#f7f3ec" stroke="#cfc6b8" stroke-width="6"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="300" y="${470 + i * 120}" width="600" height="26" fill="#2f4f6f" opacity="0.85"/>`).join("")}
    <rect x="300" y="420" width="600" height="130" rx="18" fill="#e8e1d5"/>
    <path d="M560 420 q40 -90 80 0" fill="none" stroke="#b9ad99" stroke-width="12"/>`,
    ),
  candle: (c) =>
    frame(
      "#ebe3d9",
      `
    <rect x="400" y="640" width="400" height="540" rx="40" fill="#f2ede6" stroke="#cbbfae" stroke-width="8"/>
    <rect x="400" y="820" width="400" height="200" fill="${c}"/>
    <text x="600" y="935" font-family="Georgia, serif" font-size="52" fill="#fff" text-anchor="middle">CEDAR</text>
    <rect x="590" y="560" width="20" height="90" rx="6" fill="#3a2a1a"/>
    <path d="M600 420 q60 80 0 150 q-60 -70 0 -150 z" fill="#f0a640"/>
    <path d="M600 470 q28 45 0 85 q-28 -40 0 -85 z" fill="#fde5a8"/>`,
    ),
  vase: (c) =>
    frame(
      "#e9e3ee",
      `
    <path d="M600 520 q-12 -200 30 -330" fill="none" stroke="#4d6b48" stroke-width="10"/>
    <path d="M622 300 q90 -40 120 30 q-90 30 -120 -30 z" fill="#6f8f5f"/>
    <path d="M610 400 q-90 -50 -130 20 q90 30 130 -20 z" fill="#6f8f5f"/>
    <path d="M550 520 h100 v70 q170 120 140 360 q-20 160 -190 230 q-170 -70 -190 -230 q-30 -240 140 -360 z" fill="${c}"/>
    <path d="M520 700 q-40 120 -10 260" fill="none" stroke="#fff" stroke-width="16" opacity="0.35" stroke-linecap="round"/>`,
    ),
  blanket: (c) =>
    frame(
      "#e6e8e1",
      `
    <rect x="270" y="840" width="660" height="170" rx="40" fill="${c}"/>
    <rect x="300" y="700" width="600" height="160" rx="40" fill="${c}" opacity="0.85"/>
    <rect x="330" y="1000" width="600" height="160" rx="40" fill="${c}" opacity="0.92"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<rect x="${360 + i * 56}" y="1150" width="12" height="54" rx="6" fill="${c}"/>`).join("")}
    ${[0, 1, 2].map((i) => `<rect x="${270 + i * 30}" y="${730 + i * 145}" width="600" height="10" fill="#fff" opacity="0.25"/>`).join("")}`,
    ),
  tee: (c) =>
    frame(
      "#eeebe6",
      `
    <path d="M440 400 q160 90 320 0 l260 130 l-90 220 l-110 -50 v520 h-440 v-520 l-110 50 l-90 -220 z" fill="${c}"/>
    <path d="M520 400 q80 60 160 0" fill="none" stroke="#000" stroke-width="10" opacity="0.15"/>
    <path d="M380 700 l-40 -20 M820 700 l40 -20" stroke="#000" stroke-width="8" opacity="0.08"/>`,
    ),
  tote: () =>
    frame(
      "#ede8df",
      `
    <path d="M470 600 v-130 a130 130 0 0 1 260 0 v130" fill="none" stroke="#c8a77a" stroke-width="30"/>
    <path d="M360 600 h480 l40 580 h-560 z" fill="#e4d4b5"/>
    <rect x="460" y="780" width="280" height="180" rx="12" fill="#1f3a33"/>
    <text x="600" y="890" font-family="Georgia, serif" font-size="56" fill="#f2ede6" text-anchor="middle">GOODS</text>`,
    ),
  beanie: (c) =>
    frame(
      "#e7ebee",
      `
    <path d="M330 900 q0 -420 270 -420 q270 0 270 420 z" fill="${c}"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<path d="M${380 + i * 62} 900 q${-6 + i * 2} -260 ${30 - i * 3} -390" fill="none" stroke="#000" stroke-width="6" opacity="0.08"/>`).join("")}
    <rect x="300" y="880" width="600" height="190" rx="40" fill="${c}"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => `<rect x="${330 + i * 52}" y="900" width="14" height="150" rx="7" fill="#000" opacity="0.1"/>`).join("")}
    <circle cx="600" cy="460" r="70" fill="${c}"/>`,
    ),
  notebook: (c) =>
    frame(
      "#ece9e3",
      `
    <rect x="370" y="380" width="480" height="800" rx="24" fill="#fbfaf7" transform="rotate(4 600 780)"/>
    <rect x="350" y="370" width="480" height="800" rx="24" fill="${c}"/>
    <rect x="760" y="370" width="22" height="800" fill="#1b1b1b" opacity="0.6"/>
    <rect x="430" y="520" width="260" height="70" rx="8" fill="#fff" opacity="0.9"/>
    <path d="M590 1170 v120 l-30 -30 l-30 30 v-120" fill="#a1271b"/>`,
    ),
  pen: () =>
    frame(
      "#e9e6e1",
      `
    <g transform="rotate(-35 600 800)">
      <rect x="560" y="300" width="80" height="820" rx="40" fill="#c6a15b"/>
      <rect x="560" y="300" width="80" height="260" rx="40" fill="#b08a44"/>
      <rect x="626" y="340" width="22" height="300" rx="10" fill="#9a7737"/>
      <path d="M560 1110 h80 l-40 150 z" fill="#2c2c2c"/>
      <rect x="575" y="560" width="10" height="540" fill="#fff" opacity="0.3"/>
    </g>`,
    ),
};

async function png(svg) {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function upload(name, svg, alt) {
  const form = new FormData();
  form.set("file", new Blob([await png(svg)], { type: "image/png" }), `${name}.png`);
  form.set("alt_text", alt);
  return call("POST", "/media", form, true);
}

// ───────────── Catalog ─────────────

const P = (s) => `<p>${s}</p>`;

const CATEGORIES = [
  { name: "Kitchen", description: "Everyday pieces for slow mornings and long dinners." },
  { name: "Home", description: "Soft textures and quiet objects for the rooms you live in." },
  { name: "Apparel", description: "Wardrobe staples, made to be worn often." },
  { name: "Tops", parent: "Apparel", description: "Tees and layers." },
  { name: "Accessories", parent: "Apparel", description: "Bags, hats and the small things." },
  { name: "Stationery", description: "Tools for writing things down." },
];

const COLLECTIONS = [
  { title: "Best sellers", description: "What everyone keeps coming back for." },
  { title: "Gift ideas", description: "Thoughtful presents under $80." },
];

const PRODUCTS = [
  {
    title: "Stoneware Mug",
    art: ["mug", "#2f5d50"],
    price: 2800,
    category: "Kitchen",
    collections: ["Best sellers", "Gift ideas"],
    stock: 42,
    tags: ["ceramic", "coffee"],
    description:
      P(
        "Thrown from speckled stoneware and finished in a deep forest glaze. Holds 350 ml — a proper cup of coffee.",
      ) + "<ul><li>Dishwasher and microwave safe</li><li>Each glaze varies slightly</li></ul>",
  },
  {
    title: "Pour-Over Coffee Set",
    art: ["pourover"],
    price: 6400,
    compare_at: 7800,
    category: "Kitchen",
    collections: ["Best sellers"],
    stock: 15,
    tags: ["coffee"],
    description: P("A porcelain dripper and a 600 ml borosilicate carafe. Brew two cups, slowly."),
  },
  {
    title: "Linen Tea Towel",
    art: ["towel"],
    price: 1600,
    category: "Kitchen",
    collections: ["Gift ideas"],
    stock: 80,
    tags: ["linen"],
    description: P(
      "Stonewashed European linen with a woven navy stripe. Gets softer with every wash.",
    ),
  },
  {
    title: "Cedar & Smoke Soy Candle",
    art: ["candle", "#6b4f3a"],
    price: 3400,
    category: "Home",
    collections: ["Best sellers", "Gift ideas"],
    stock: 30,
    tags: ["candle", "fragrance"],
    description: P(
      "Hand-poured soy wax with cedarwood, vetiver and a hint of campfire. Around 50 hours of burn time.",
    ),
  },
  {
    title: "Ceramic Bud Vase",
    art: ["vase", "#c9a48a"],
    price: 3900,
    category: "Home",
    collections: ["Gift ideas"],
    stock: 0,
    tags: ["ceramic"],
    description: P("A small matte vase for a single stem. Watertight, 18 cm tall."),
  },
  {
    title: "Wool Throw Blanket",
    art: ["blanket", "#8a6f4e"],
    price: 14800,
    category: "Home",
    collections: ["Best sellers"],
    stock: 9,
    tags: ["wool"],
    description: P("Woven from undyed lambswool with a hand-knotted fringe. 130 × 180 cm."),
  },
  {
    title: "Organic Cotton Tee",
    art: null,
    price: 3600,
    category: "Tops",
    collections: ["Best sellers"],
    tags: ["cotton", "organic"],
    description: P(
      "Heavyweight organic cotton, garment-dyed for a lived-in feel. Relaxed fit — size down for a closer cut.",
    ),
    options: [
      { name: "Color", values: ["Sand", "Forest", "Charcoal"] },
      { name: "Size", values: ["S", "M", "L", "XL"] },
    ],
    colors: { Sand: "#d8c3a0", Forest: "#2f5d50", Charcoal: "#3b3b3d" },
    soldOut: ["Charcoal / XL", "Forest / S"],
  },
  {
    title: "Canvas Market Tote",
    art: ["tote"],
    price: 4200,
    category: "Accessories",
    collections: ["Gift ideas"],
    stock: 25,
    tags: ["canvas"],
    description: P("Heavy 16 oz canvas with leather-reinforced handles and an inside pocket."),
  },
  {
    title: "Merino Beanie",
    art: ["beanie", "#a1271b"],
    price: 3800,
    compare_at: 4800,
    category: "Accessories",
    collections: ["Gift ideas"],
    stock: 18,
    tags: ["wool"],
    description: P("Fine-rib merino wool. Warm without the itch."),
  },
  {
    title: "Dot Grid Notebook",
    art: ["notebook", "#1f3a33"],
    price: 1900,
    category: "Stationery",
    collections: ["Gift ideas"],
    stock: 60,
    tags: ["paper"],
    description: P(
      "A5, 192 pages of 100 gsm dot-grid paper that takes fountain-pen ink without bleeding.",
    ),
  },
  {
    title: "Brass Pen",
    art: ["pen"],
    price: 5200,
    category: "Stationery",
    collections: [],
    stock: 12,
    tags: ["brass"],
    description: P(
      "Machined from solid brass. It develops a warm patina the more you write with it.",
    ),
  },
];

async function findByTitle(title) {
  const list = await call("GET", `/products?q=${encodeURIComponent(title)}&page_size=50`);
  return list.find((p) => p.title === title);
}

async function main() {
  await login();
  console.log(`Signed in to ${API} as ${EMAIL}`);

  // Categories (parents first).
  const existingCats = await call("GET", "/categories");
  const catId = new Map(existingCats.map((c) => [c.name, c.id]));
  for (const c of CATEGORIES) {
    if (catId.has(c.name)) continue;
    const made = await call("POST", "/categories", {
      name: c.name,
      description_html: P(c.description),
      ...(c.parent ? { parent_id: catId.get(c.parent) } : {}),
    });
    catId.set(c.name, made.id);
    console.log(`+ category ${c.name}`);
  }

  // Collections.
  const colId = new Map();
  for (const c of COLLECTIONS) {
    const found = (await call("GET", `/collections?q=${encodeURIComponent(c.title)}`)).find(
      (x) => x.title === c.title,
    );
    colId.set(
      c.title,
      found?.id ??
        (
          await call("POST", "/collections", {
            title: c.title,
            description_html: P(c.description),
            status: "active",
          })
        ).id,
    );
    if (!found) console.log(`+ collection ${c.title}`);
  }

  for (const p of PRODUCTS) {
    if (await findByTitle(p.title)) {
      console.log(`= ${p.title} (exists)`);
      continue;
    }
    const base = {
      title: p.title,
      vendor: VENDOR,
      description_html: p.description,
      category_ids: [catId.get(p.category)],
      collection_ids: p.collections.map((t) => colId.get(t)),
      tags: p.tags,
      price_minor: p.price,
      ...(p.compare_at ? { compare_at_minor: p.compare_at } : {}),
    };

    if (!p.options) {
      const [art, color] = p.art;
      const img = await upload(art, ART[art](color), p.title);
      await call("POST", "/products", {
        ...base,
        status: "active",
        inventory_quantity: p.stock,
        media: [{ media_asset_id: img.id }],
      });
      console.log(`+ ${p.title}`);
      continue;
    }

    // Variable product: one image per color, options → variants, per-variant stock.
    const images = {};
    for (const [name, hex] of Object.entries(p.colors)) {
      images[name] = await upload(`tee-${name}`, ART.tee(hex), `${p.title} in ${name}`);
    }
    const created = await call("POST", "/products", {
      ...base,
      media: Object.values(images).map((m) => ({ media_asset_id: m.id })),
    });
    await call("PUT", `/products/${created.id}/options`, { options: p.options });
    const detail = await call("GET", `/products/${created.id}`);
    await call("PATCH", `/products/${created.id}/variants`, {
      variant_ids: detail.variants.map((v) => v.id),
      set: { price_minor: p.price },
    });
    for (const v of detail.variants) {
      const color = v.option_values.find((o) => o.option === "Color")?.value;
      await call("PATCH", `/variants/${v.id}`, { media_asset_id: images[color].id });
      const sold = p.soldOut.includes(v.title);
      if (!sold) {
        await call("POST", "/inventory/adjustments", {
          variant_id: v.id,
          mode: "set",
          quantity: 10 + ((v.title.length * 7) % 20),
          reason: "received",
        });
      }
    }
    await call("POST", `/products/${created.id}/publish`);
    console.log(`+ ${p.title} (${detail.variants.length} variants)`);
  }
  console.log("Demo catalog ready.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
