import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { InvalidImageError, processImage, sniffImageType } from "./image-processor";

const png = (w = 400, h = 300) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#c2410c" } })
    .png()
    .toBuffer();

describe("image processing", () => {
  it("sniffs real types from bytes", async () => {
    expect(sniffImageType(await png())).toBe("image/png");
    expect(
      sniffImageType(
        await sharp(await png())
          .jpeg()
          .toBuffer(),
      ),
    ).toBe("image/jpeg");
    expect(
      sniffImageType(
        await sharp(await png())
          .webp()
          .toBuffer(),
      ),
    ).toBe("image/webp");
    expect(sniffImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImageType(Buffer.from("GIF89a"))).toBeNull();
  });

  it("produces derivatives without enlarging", async () => {
    const r = await processImage(await png(400, 300));
    expect(r.original).toMatchObject({ width: 400, height: 300 });
    const sizes = Object.fromEntries(r.derivatives.map((d) => [d.name, [d.width, d.height]]));
    expect(sizes).toEqual({ thumb: [160, 120], medium: [400, 300], large: [400, 300] });
    expect(r.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("strips EXIF metadata from the stored original", async () => {
    const withExif = await sharp(await png())
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "secret-gps-owner" } } })
      .toBuffer();
    expect(withExif.includes(Buffer.from("secret-gps-owner"))).toBe(true);
    const r = await processImage(withExif);
    expect(r.original.body.includes(Buffer.from("secret-gps-owner"))).toBe(false);
  });

  it("rejects disguised and corrupt files", async () => {
    await expect(processImage(Buffer.from("not an image at all"))).rejects.toBeInstanceOf(
      InvalidImageError,
    );
    const truncated = (await png()).subarray(0, 60);
    await expect(processImage(truncated)).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("rejects oversized dimensions", async () => {
    const huge = await sharp({
      create: { width: 8001, height: 10, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    await expect(processImage(huge)).rejects.toThrow(/at most 8000/);
  });
});
