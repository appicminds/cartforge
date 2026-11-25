import sharp from "sharp";

/**
 * Pictures for sample products, drawn here (no stock photos): a garment on a
 * hanger against a soft studio backdrop. Each product gets a full view and a
 * close-up of the same drawing.
 */

export type Garment = "abaya" | "dress" | "hijab";
export type Finish =
  | "plain"
  | "sheen"
  | "lace"
  | "velvet"
  | "beaded"
  | "embroidery"
  | "stripes"
  | "floral"
  | "marble"
  | "jacquard"
  | "trim";

export interface Look {
  garment: Garment;
  color: string;
  finish: Finish;
  /** Second color for prints, trims and embellishment. */
  detail?: string;
}

const ABAYA =
  "M390,200 Q450,246 510,200 L600,214 L706,566 L612,602 L586,336 L708,1110 Q450,1142 192,1110 L314,336 L288,602 L194,566 L300,214 Z";
const DRESS =
  "M398,204 Q450,250 502,204 L574,220 L612,330 L566,352 L560,470 L660,1104 Q450,1134 240,1104 L340,470 L334,352 L288,330 L326,220 Z";
const HIJAB =
  "M300,214 L600,214 C614,420 640,720 622,986 Q566,1016 522,966 Q488,1004 450,972 Q412,1004 378,966 Q334,1016 278,986 C260,720 286,420 300,214 Z";

const shape = (g: Garment) => (g === "abaya" ? ABAYA : g === "dress" ? DRESS : HIJAB);

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

/** Pattern and decoration drawn inside the garment outline. */
function finishLayer(look: Look): string {
  const d = look.detail ?? (luminance(look.color) < 0.4 ? "#d9b98c" : "#3a2f26");
  const isAbaya = look.garment === "abaya";
  switch (look.finish) {
    case "stripes":
      return `<rect x="0" y="0" width="900" height="1200" fill="url(#stripes)"/>`;
    case "floral":
      return `<rect x="0" y="0" width="900" height="1200" fill="url(#floral)"/>`;
    case "marble":
      return `<rect x="0" y="0" width="900" height="1200" fill="url(#marble)"/>`;
    case "jacquard":
      return `<rect x="0" y="0" width="900" height="1200" fill="url(#jacquard)"/>`;
    case "lace":
      return isAbaya
        ? `<rect x="0" y="960" width="900" height="200" fill="url(#lace)"/><rect x="180" y="500" width="140" height="120" fill="url(#lace)"/><rect x="580" y="500" width="140" height="120" fill="url(#lace)"/>`
        : `<rect x="0" y="0" width="900" height="1200" fill="url(#lace)" opacity=".7"/>`;
    case "velvet":
      return `<rect x="0" y="0" width="900" height="1200" fill="url(#velvet)"/>`;
    case "beaded":
      return (
        Array.from({ length: 34 }, (_, i) => {
          const y = 250 + i * 25;
          const w = 8 + (i % 3) * 3;
          return `<circle cx="${450 - w}" cy="${y}" r="3.2" fill="${d}"/><circle cx="${450 + w}" cy="${y + 12}" r="3.2" fill="${d}"/>`;
        }).join("") +
        `<rect x="0" y="1060" width="900" height="16" fill="url(#beads)"/><rect x="190" y="548" width="140" height="14" fill="url(#beads)" transform="rotate(10 260 555)"/><rect x="570" y="548" width="140" height="14" fill="url(#beads)" transform="rotate(-10 640 555)"/>`
      );
    case "embroidery":
      return (
        [0, 1, 2, 3, 4, 5, 6, 7]
          .map((i) => {
            const y = 300 + i * 95;
            return `<path d="M450,${y} q-34,-20 -46,8 q24,6 46,-8 q34,-20 46,8 q-24,6 -46,-8" fill="none" stroke="${d}" stroke-width="3"/><circle cx="450" cy="${y + 30}" r="5" fill="${d}"/>`;
          })
          .join("") +
        `<path d="M200,1080 Q450,1110 700,1080" stroke="${d}" stroke-width="6" fill="none" stroke-dasharray="2 10" stroke-linecap="round"/>`
      );
    case "trim":
      return `<path d="M450,226 L450,1126" stroke="${d}" stroke-width="18"/><path d="M196,1100 Q450,1132 704,1100" stroke="${d}" stroke-width="16" fill="none"/>`;
    case "sheen":
      return `<rect x="0" y="0" width="900" height="1200" fill="url(#sheen)"/>`;
    default:
      return "";
  }
}

function defs(look: Look): string {
  const c = look.color;
  const d = look.detail ?? (luminance(c) < 0.4 ? "#d9b98c" : "#3a2f26");
  return `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3f0ea"/><stop offset="1" stop-color="#ddd6c9"/></linearGradient>
  <linearGradient id="fold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#000" stop-opacity=".12"/><stop offset=".7" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
  <radialGradient id="velvet" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset=".2" stop-color="#fff" stop-opacity="0"/><stop offset=".4" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#fff" stop-opacity=".12"/><stop offset=".85" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <pattern id="stripes" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(8)"><rect width="16" height="46" fill="${d}" opacity=".85"/><rect x="24" width="4" height="46" fill="${d}" opacity=".5"/></pattern>
  <pattern id="floral" width="110" height="110" patternUnits="userSpaceOnUse"><g fill="${d}" opacity=".8"><circle cx="30" cy="30" r="9"/><circle cx="30" cy="14" r="7"/><circle cx="30" cy="46" r="7"/><circle cx="14" cy="30" r="7"/><circle cx="46" cy="30" r="7"/><circle cx="85" cy="82" r="5"/><circle cx="85" cy="72" r="4"/><circle cx="85" cy="92" r="4"/><circle cx="75" cy="82" r="4"/><circle cx="95" cy="82" r="4"/></g><circle cx="30" cy="30" r="4" fill="${c}"/></pattern>
  <pattern id="marble" width="300" height="300" patternUnits="userSpaceOnUse"><path d="M0,60 C80,20 120,140 200,90 S300,40 300,120 M0,200 C60,160 140,260 220,210 S280,180 300,230 M40,0 C70,90 30,160 90,300" stroke="${d}" stroke-width="5" fill="none" opacity=".6"/><path d="M0,120 C100,90 140,190 300,170" stroke="#fff" stroke-width="2" fill="none" opacity=".35"/></pattern>
  <pattern id="jacquard" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M30,4 L56,30 L30,56 L4,30 Z" fill="none" stroke="${d}" stroke-width="3" opacity=".55"/><circle cx="30" cy="30" r="4" fill="${d}" opacity=".6"/></pattern>
  <pattern id="lace" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="9" fill="none" stroke="${d}" stroke-width="2" opacity=".75"/><circle cx="0" cy="0" r="4" fill="${d}" opacity=".6"/><circle cx="28" cy="28" r="4" fill="${d}" opacity=".6"/><circle cx="28" cy="0" r="4" fill="${d}" opacity=".6"/><circle cx="0" cy="28" r="4" fill="${d}" opacity=".6"/></pattern>
  <pattern id="beads" width="18" height="16" patternUnits="userSpaceOnUse"><circle cx="9" cy="8" r="4" fill="${d}"/></pattern>
  <clipPath id="g"><path d="${shape(look.garment)}"/></clipPath>
</defs>`;
}

/** The garment on its hanger, in a 900×1200 drawing space. */
function figure(look: Look, dx = 0, dy = 0, scale = 1): string {
  const s = shape(look.garment);
  const seam =
    look.garment === "abaya"
      ? `<path d="M450,226 L450,1126" stroke="#000" stroke-opacity=".28" stroke-width="3"/>`
      : look.garment === "dress"
        ? `<path d="M340,470 Q450,490 560,470" stroke="#000" stroke-opacity=".25" stroke-width="4" fill="none"/>`
        : `<path d="M450,214 L450,900" stroke="#000" stroke-opacity=".15" stroke-width="2"/>`;
  return `<g transform="translate(${dx} ${dy}) scale(${scale})">
  <ellipse cx="450" cy="1130" rx="300" ry="26" fill="#000" opacity=".1"/>
  <path d="M450,132 q0,-34 26,-34 q24,0 24,22" fill="none" stroke="#8b7f70" stroke-width="7" stroke-linecap="round"/>
  <path d="M450,130 L280,212 L620,212 Z" fill="none" stroke="#8b7f70" stroke-width="8" stroke-linejoin="round"/>
  <path d="${s}" fill="${look.color}"/>
  <g clip-path="url(#g)">${finishLayer(look)}<rect x="0" y="0" width="900" height="1200" fill="url(#fold)"/>${seam}</g>
  <path d="${s}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="2"/>
</g>`;
}

const svg = (w: number, h: number, viewBox: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">${body}</svg>`;

const png = (s: string) => sharp(Buffer.from(s)).png({ compressionLevel: 9 }).toBuffer();

/** Full view (900×1200) and a close-up of the upper body. */
export async function productImages(look: Look): Promise<[Buffer, Buffer]> {
  const body = `${defs(look)}<rect width="900" height="1200" fill="url(#bg)"/>${figure(look)}`;
  const crop = look.garment === "hijab" ? "240 180 420 560" : "255 170 390 520";
  return Promise.all([png(svg(900, 1200, "0 0 900 1200", body)), png(svg(900, 1200, crop, body))]);
}

/** Several garments on a rail (1800×900 unless given), on a dark or light wall. */
export async function bannerImage(
  looks: Look[],
  tone: "dark" | "light" = "dark",
  W = 1800,
  H = 900,
): Promise<Buffer> {
  const bg =
    tone === "dark"
      ? `<linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a332b"/><stop offset="1" stop-color="#14110e"/></linearGradient>`
      : `<linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f1eb"/><stop offset="1" stop-color="#d8d0c2"/></linearGradient>`;
  const n = looks.length;
  const gap = 40;
  const scale = Math.min(0.62 * (H / 900), (W - 160 - (n - 1) * gap) / (n * 900));
  const w = 900 * scale;
  const top = (H - 1200 * scale) / 2 + 20;
  const left = (W - (n * w + (n - 1) * gap)) / 2;
  // Ids are prefixed per figure so each keeps its own patterns and outline.
  const figs = looks
    .map((l, i) => {
      const own = `${defs(l)}${figure(l)}`.replace(/(id="|url\(#)/g, `$1f${i}-`);
      return `<svg x="${left + i * (w + gap)}" y="${top}" width="${w}" height="${1200 * scale}" viewBox="0 0 900 1200">${own}</svg>`;
    })
    .join("");
  return png(
    svg(
      W,
      H,
      `0 0 ${W} ${H}`,
      `<defs>${bg}</defs><rect width="${W}" height="${H}" fill="url(#wall)"/><rect x="${left - 40}" y="${top + 128 * scale}" width="${W - 2 * left + 80}" height="8" rx="4" fill="#9c8f7d"/>${figs}`,
    ),
  );
}
