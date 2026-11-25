import type { Look } from "./art";

/**
 * Sample catalog for the Noor theme: an original modest-wear range (names,
 * copy and pictures written for CartForge). Prices are in Pakistani rupees and
 * converted for stores in other currencies.
 */

export interface SampleCollection {
  handle: string;
  title: string;
  description: string;
}

export interface SampleProduct {
  handle: string;
  title: string;
  /** Whole rupees. */
  price: number;
  compare_at?: number;
  collections: string[];
  tags: string[];
  look: Look;
  description: string;
  options: { name: string; values: string[] }[];
}

export const NOOR_COLLECTIONS: SampleCollection[] = [
  {
    handle: "best-sellers",
    title: "Best sellers",
    description: "The pieces our customers order again and again.",
  },
  { handle: "new-in", title: "New in", description: "Fresh from the studio this month." },
  {
    handle: "black-abayas",
    title: "Black abayas",
    description: "Everyday and occasion abayas in black.",
  },
  {
    handle: "printed-abayas",
    title: "Printed abayas",
    description: "Stripes, florals and soft prints for every day.",
  },
  {
    handle: "premium-abayas",
    title: "Premium abayas",
    description: "Cupro, jacquard and hand-finished occasion pieces.",
  },
  {
    handle: "velvet-and-lace",
    title: "Velvet and lace",
    description: "Winter velvet and fine lace details.",
  },
  {
    handle: "ready-to-wear",
    title: "Ready to wear",
    description: "In stock and shipped in 1–2 working days.",
  },
  {
    handle: "dresses",
    title: "Dresses",
    description: "Inner dresses and slips to wear under your abaya.",
  },
  { handle: "hijabs", title: "Hijabs", description: "Chiffon, jersey, crepe and satin hijabs." },
];

const ABAYA_OPTIONS = [
  { name: "Size", values: ["XS", "S", "M", "L", "XL", "2XL"] },
  { name: "Length", values: ['52"', '54"', '56"', '58"', '60"'] },
];
const DRESS_OPTIONS = [{ name: "Size", values: ["XS", "S", "M", "L", "XL"] }];

const abayaCopy = (
  lead: string,
  fabric: string,
  care = "Dry clean, or hand wash cold and hang to dry.",
) =>
  `<p>${lead}</p><ul><li>Fabric: ${fabric}</li><li>Comes with a matching hijab</li><li>Relaxed fit with a front opening and inside snap</li><li>Choose your length from 52 to 60 inches</li></ul><p><strong>Care:</strong> ${care}</p>`;

type Def = Omit<SampleProduct, "options" | "description"> & {
  lead: string;
  fabric: string;
  care?: string;
};

const abayas: Def[] = [
  {
    handle: "classic-black-nida-abaya",
    title: "Classic Black Nida Abaya",
    price: 8500,
    collections: ["black-abayas", "ready-to-wear", "best-sellers"],
    tags: ["nida", "black", "everyday"],
    look: { garment: "abaya", color: "#151515", finish: "plain" },
    lead: "Our everyday essential in soft, matte nida that drapes without clinging.",
    fabric: "Nida",
  },
  {
    handle: "black-crepe-piped-abaya",
    title: "Black Crepe Piped Abaya",
    price: 9500,
    collections: ["black-abayas", "best-sellers"],
    tags: ["crepe", "black"],
    look: { garment: "abaya", color: "#1a1a1a", finish: "trim", detail: "#3b3b3b" },
    lead: "Light crepe with fine satin piping along the opening and hem.",
    fabric: "Crepe with satin piping",
  },
  {
    handle: "black-lace-cuff-abaya",
    title: "Black Lace Cuff Abaya",
    price: 12500,
    collections: ["black-abayas", "velvet-and-lace", "new-in"],
    tags: ["lace", "black"],
    look: { garment: "abaya", color: "#161616", finish: "lace", detail: "#5c5c5c" },
    lead: "A clean black abaya finished with French-style lace at the cuffs and hem.",
    fabric: "Crepe with lace trim",
  },
  {
    handle: "midnight-velvet-abaya",
    title: "Midnight Velvet Abaya",
    price: 18500,
    collections: ["velvet-and-lace", "premium-abayas", "new-in"],
    tags: ["velvet", "navy", "winter"],
    look: { garment: "abaya", color: "#1b1f3b", finish: "velvet" },
    lead: "Deep navy velvet with a soft sheen, made for winter evenings.",
    fabric: "Stretch velvet",
    care: "Dry clean only.",
  },
  {
    handle: "black-velvet-rose-abaya",
    title: "Black Velvet Rose Abaya",
    price: 17500,
    collections: ["velvet-and-lace", "black-abayas", "new-in"],
    tags: ["velvet", "embroidery", "black"],
    look: { garment: "abaya", color: "#141414", finish: "embroidery", detail: "#8c2f39" },
    lead: "Black velvet with a trail of rose-red embroidery down the front.",
    fabric: "Velvet with thread embroidery",
    care: "Dry clean only.",
  },
  {
    handle: "charcoal-cupro-abaya",
    title: "Charcoal Cupro Abaya",
    price: 16000,
    collections: ["premium-abayas", "best-sellers"],
    tags: ["cupro", "grey"],
    look: { garment: "abaya", color: "#3a3a3c", finish: "sheen" },
    lead: "Silky cupro that breathes like cotton and falls beautifully.",
    fabric: "Cupro",
  },
  {
    handle: "navy-cupro-abaya",
    title: "Navy Cupro Abaya",
    price: 16000,
    collections: ["premium-abayas"],
    tags: ["cupro", "navy"],
    look: { garment: "abaya", color: "#1f2a44", finish: "sheen" },
    lead: "Our cupro abaya in a rich navy, easy to dress up or down.",
    fabric: "Cupro",
  },
  {
    handle: "mocha-linen-abaya",
    title: "Mocha Linen Abaya",
    price: 10500,
    collections: ["new-in", "ready-to-wear"],
    tags: ["linen", "brown", "summer"],
    look: { garment: "abaya", color: "#7a5c48", finish: "plain" },
    lead: "Washed linen blend in a warm mocha, cool enough for summer.",
    fabric: "Linen blend",
    care: "Machine wash cold on a gentle cycle.",
  },
  {
    handle: "sand-linen-kimono-abaya",
    title: "Sand Linen Kimono Abaya",
    price: 10500,
    collections: ["new-in", "best-sellers", "ready-to-wear"],
    tags: ["linen", "beige", "kimono"],
    look: { garment: "abaya", color: "#cdb79a", finish: "trim", detail: "#7a5c48" },
    lead: "A kimono-sleeve cut in sand linen with a contrast front band.",
    fabric: "Linen blend",
    care: "Machine wash cold on a gentle cycle.",
  },
  {
    handle: "olive-satin-abaya",
    title: "Olive Satin Abaya",
    price: 13500,
    collections: ["new-in"],
    tags: ["satin", "green"],
    look: { garment: "abaya", color: "#4b5a3c", finish: "sheen" },
    lead: "Fluid satin in a muted olive with a gentle shine.",
    fabric: "Satin",
  },
  {
    handle: "plum-jacquard-abaya",
    title: "Plum Jacquard Abaya",
    price: 15500,
    collections: ["premium-abayas"],
    tags: ["jacquard", "purple"],
    look: { garment: "abaya", color: "#4a2340", finish: "jacquard", detail: "#b98aa8" },
    lead: "Woven jacquard with a small diamond motif in deep plum.",
    fabric: "Jacquard",
  },
  {
    handle: "black-gold-beaded-abaya",
    title: "Black Gold-Beaded Abaya",
    price: 22000,
    collections: ["premium-abayas", "black-abayas", "best-sellers"],
    tags: ["beaded", "occasion", "black"],
    look: { garment: "abaya", color: "#121212", finish: "beaded" },
    lead: "Hand-set gold beads line the front, cuffs and hem. Our favourite for Eid and weddings.",
    fabric: "Crepe with hand beading",
    care: "Dry clean only.",
  },
  {
    handle: "ivory-embroidered-eid-abaya",
    title: "Ivory Embroidered Eid Abaya",
    price: 24000,
    collections: ["premium-abayas", "new-in"],
    tags: ["embroidery", "ivory", "occasion"],
    look: { garment: "abaya", color: "#efe6d6", finish: "embroidery", detail: "#a7803f" },
    lead: "Soft ivory with gold thread embroidery, made for celebrations.",
    fabric: "Crepe with zari embroidery",
    care: "Dry clean only.",
  },
  {
    handle: "rust-stripe-printed-abaya",
    title: "Rust Stripe Printed Abaya",
    price: 11500,
    collections: ["printed-abayas", "best-sellers"],
    tags: ["printed", "stripes", "orange"],
    look: { garment: "abaya", color: "#8a3b1e", finish: "stripes", detail: "#e0b58a" },
    lead: "Bold rust and sand stripes on a light, easy fabric.",
    fabric: "Printed crepe",
  },
  {
    handle: "grey-marble-print-abaya",
    title: "Grey Marble Print Abaya",
    price: 11500,
    collections: ["printed-abayas"],
    tags: ["printed", "grey"],
    look: { garment: "abaya", color: "#8d8a86", finish: "marble", detail: "#4e4b47" },
    lead: "A soft marble print in stone grey that goes with everything.",
    fabric: "Printed crepe",
  },
  {
    handle: "lilac-floral-printed-abaya",
    title: "Lilac Floral Printed Abaya",
    price: 11500,
    collections: ["printed-abayas", "new-in"],
    tags: ["printed", "floral", "purple"],
    look: { garment: "abaya", color: "#8c7aa8", finish: "floral", detail: "#f2e6f0" },
    lead: "Small white blossoms scattered over a gentle lilac.",
    fabric: "Printed chiffon with inner lining",
  },
  {
    handle: "black-floral-print-abaya",
    title: "Black Floral Print Abaya",
    price: 11000,
    collections: ["printed-abayas", "black-abayas"],
    tags: ["printed", "floral", "black"],
    look: { garment: "abaya", color: "#141414", finish: "floral", detail: "#c9b08a" },
    lead: "A quiet gold floral print on black for everyday elegance.",
    fabric: "Printed crepe",
  },
  {
    handle: "teal-crepe-abaya",
    title: "Teal Crepe Abaya",
    price: 9500,
    compare_at: 12000,
    collections: ["ready-to-wear"],
    tags: ["crepe", "green", "sale"],
    look: { garment: "abaya", color: "#1f5f5b", finish: "plain" },
    lead: "A deep teal crepe abaya, now at a special price while stock lasts.",
    fabric: "Crepe",
  },
];

const dresses: Def[] = [
  {
    handle: "black-slip-dress",
    title: "Black Slip Dress",
    price: 4500,
    collections: ["dresses", "best-sellers"],
    tags: ["dress", "black"],
    look: { garment: "dress", color: "#141414", finish: "sheen" },
    lead: "A smooth inner dress that lets your abaya glide.",
    fabric: "Satin-back crepe",
  },
  {
    handle: "champagne-satin-slip-dress",
    title: "Champagne Satin Slip Dress",
    price: 5500,
    collections: ["dresses", "new-in"],
    tags: ["dress", "satin", "beige"],
    look: { garment: "dress", color: "#d9c3a0", finish: "sheen" },
    lead: "Champagne satin with a soft waist seam, lovely under open abayas.",
    fabric: "Satin",
  },
  {
    handle: "navy-inner-maxi-dress",
    title: "Navy Inner Maxi Dress",
    price: 4500,
    collections: ["dresses"],
    tags: ["dress", "navy"],
    look: { garment: "dress", color: "#1f2a44", finish: "plain" },
    lead: "Breathable jersey maxi in navy for all-day comfort.",
    fabric: "Cotton jersey",
  },
];

const hijabs: Def[] = [
  {
    handle: "premium-chiffon-hijab-black",
    title: "Premium Chiffon Hijab, Black",
    price: 1800,
    collections: ["hijabs", "best-sellers"],
    tags: ["hijab", "chiffon", "black"],
    look: { garment: "hijab", color: "#161616", finish: "sheen" },
    lead: "Light, non-slip chiffon that holds its shape all day.",
    fabric: "Georgette chiffon, 180 × 70 cm",
  },
  {
    handle: "modal-jersey-hijab-taupe",
    title: "Modal Jersey Hijab, Taupe",
    price: 1500,
    collections: ["hijabs"],
    tags: ["hijab", "jersey", "beige"],
    look: { garment: "hijab", color: "#a08b78", finish: "plain" },
    lead: "Stretchy, breathable modal jersey that needs no pins.",
    fabric: "Modal jersey, 180 × 80 cm",
  },
  {
    handle: "crinkle-crepe-hijab-dusty-rose",
    title: "Crinkle Crepe Hijab, Dusty Rose",
    price: 1600,
    collections: ["hijabs", "new-in"],
    tags: ["hijab", "crepe", "pink"],
    look: { garment: "hijab", color: "#c9a0a0", finish: "plain" },
    lead: "Textured crinkle crepe in a soft dusty rose.",
    fabric: "Crinkle crepe, 180 × 75 cm",
  },
  {
    handle: "satin-silk-hijab-champagne",
    title: "Satin Silk Hijab, Champagne",
    price: 2200,
    collections: ["hijabs"],
    tags: ["hijab", "satin", "occasion"],
    look: { garment: "hijab", color: "#d8c4a2", finish: "sheen" },
    lead: "A glossy satin hijab for weddings and Eid.",
    fabric: "Satin silk, 180 × 70 cm",
  },
];

export const NOOR_PRODUCTS: SampleProduct[] = [
  ...abayas.map(({ lead, fabric, care, ...p }) => ({
    ...p,
    description: abayaCopy(lead, fabric, care),
    options: ABAYA_OPTIONS,
  })),
  ...dresses.map(({ lead, fabric, care: _care, ...p }) => ({
    ...p,
    description: `<p>${lead}</p><ul><li>Fabric: ${fabric}</li><li>Ankle length, sleeveless</li></ul>`,
    options: DRESS_OPTIONS,
  })),
  ...hijabs.map(({ lead, fabric, care: _care, ...p }) => ({
    ...p,
    description: `<p>${lead}</p><ul><li>${fabric}</li></ul>`,
    options: [],
  })),
];

/** Banner pictures for the theme's slideshow and story section. */
export const NOOR_BANNERS: Look[][] = [
  [
    { garment: "abaya", color: "#1b1f3b", finish: "velvet" },
    { garment: "abaya", color: "#141414", finish: "embroidery", detail: "#8c2f39" },
    { garment: "abaya", color: "#161616", finish: "lace", detail: "#5c5c5c" },
  ],
  [
    { garment: "abaya", color: "#7a5c48", finish: "plain" },
    { garment: "abaya", color: "#cdb79a", finish: "trim", detail: "#7a5c48" },
    { garment: "abaya", color: "#1f5f5b", finish: "plain" },
  ],
  [
    { garment: "abaya", color: "#cdb79a", finish: "trim", detail: "#7a5c48" },
    { garment: "abaya", color: "#8c7aa8", finish: "floral", detail: "#f2e6f0" },
  ],
];

/** Rupees → this store's currency (rough, rounded to friendly prices). */
export function localPrice(rupees: number, currency: string): number {
  switch (currency) {
    case "PKR":
      return rupees;
    case "INR":
      return Math.round((rupees * 0.3) / 50) * 50 - 1;
    case "AED":
    case "SAR":
    case "QAR":
      return Math.max(5, Math.round(rupees / 76 / 5) * 5);
    case "GBP":
      return Math.max(1, Math.round(rupees / 355)) - 0.01;
    case "EUR":
      return Math.max(1, Math.round(rupees / 300)) - 0.01;
    default:
      return Math.max(1, Math.round(rupees / 280)) - 0.01;
  }
}
