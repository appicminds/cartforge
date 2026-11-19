import sharp from "sharp";

/** Generated test images (no binary fixtures in the repo). */
export async function makeImage(
  opts: { w?: number; h?: number; color?: string; format?: "png" | "jpeg" | "webp" } = {},
) {
  const { w = 320, h = 240, color = "#c2410c", format = "png" } = opts;
  const img = sharp({ create: { width: w, height: h, channels: 3, background: color } });
  return (format === "jpeg" ? img.jpeg() : format === "webp" ? img.webp() : img.png()).toBuffer();
}

/** A unique image every call (different colour/size), so de-duplication doesn't kick in. */
let n = 0;
export function uniqueImage(format: "png" | "jpeg" | "webp" = "png") {
  n += 1;
  const c = (Date.now() + n * 7919) % 0xffffff;
  return makeImage({
    w: 200 + (n % 50),
    h: 150 + (n % 30),
    color: `#${c.toString(16).padStart(6, "0")}`,
    format,
  });
}
