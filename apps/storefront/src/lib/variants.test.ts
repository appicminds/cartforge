import type { StorefrontVariant } from "@cartforge/types";
import { describe, expect, it } from "vitest";
import { choose, findVariant, initialVariant, valueState } from "./variants";

const v = (id: string, size: string, color: string, available = true): StorefrontVariant => ({
  id,
  title: `${size} / ${color}`,
  options: [
    { option: "Size", value: size },
    { option: "Color", value: color },
  ],
  price_minor: 1000,
  compare_at_minor: null,
  available,
  image_index: null,
});

// No "L / Blue" combination; "S / Red" is sold out.
const variants = [v("sr", "S", "Red", false), v("sb", "S", "Blue"), v("lr", "L", "Red")];

describe("variant selection", () => {
  it("starts on the requested, else first available variant", () => {
    expect(initialVariant(variants, "lr")?.id).toBe("lr");
    expect(initialVariant(variants, "nope")?.id).toBe("sb");
    expect(initialVariant([v("x", "S", "Red", false)])?.id).toBe("x");
  });

  it("reports value states relative to the other selections", () => {
    const sel = { Size: "S", Color: "Blue" };
    expect(valueState(variants, sel, "Color", "Red")).toBe("sold_out");
    expect(valueState(variants, { Size: "L", Color: "Red" }, "Color", "Blue")).toBe("unavailable");
    expect(valueState(variants, sel, "Size", "L")).toBe("unavailable");
    expect(valueState(variants, { Size: "S", Color: "Red" }, "Size", "L")).toBe("available");
  });

  it("moves to the closest existing variant when a combination doesn't exist", () => {
    expect(choose(variants, { Size: "S", Color: "Blue" }, "Size", "L")?.id).toBe("lr");
    expect(choose(variants, { Size: "L", Color: "Red" }, "Size", "S")?.id).toBe("sr");
    expect(findVariant(variants, { Size: "L", Color: "Blue" })).toBeUndefined();
  });
});
