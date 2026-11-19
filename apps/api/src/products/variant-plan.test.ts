import { describe, expect, it } from "vitest";
import { combinations, comboTitle, planVariants, type ExistingVariant } from "./variant-plan";

const v = (id: string, position: number, values: Record<string, string>): ExistingVariant => ({
  id,
  title: Object.values(values).join(" / ") || "Default",
  position,
  values,
});
const titles = (p: ReturnType<typeof planVariants>) => ({
  keep: p.keep.map((k) => `${k.variant_id}→${comboTitle(k.combination)}`),
  create: p.create.map(comboTitle),
  remove: p.remove.map((r) => r.id),
});

describe("combinations", () => {
  it("builds the cartesian product in option order", () => {
    expect(
      combinations([
        { name: "Size", values: ["S", "M"] },
        { name: "Color", values: ["Red", "Blue"] },
      ]).map(comboTitle),
    ).toEqual(["S / Red", "S / Blue", "M / Red", "M / Blue"]);
  });
});

describe("planVariants", () => {
  it("simple → variable: default variant becomes the first combination (keeps its data)", () => {
    const p = planVariants([{ name: "Size", values: ["S", "M", "L"] }], [v("d", 0, {})]);
    expect(titles(p)).toEqual({ keep: ["d→S"], create: ["M", "L"], remove: [] });
  });

  it("adding a value creates only the new combinations", () => {
    const existing = [v("s", 0, { Size: "S" }), v("m", 1, { Size: "M" })];
    const p = planVariants([{ name: "Size", values: ["S", "M", "XL"] }], existing);
    expect(titles(p)).toEqual({ keep: ["s→S", "m→M"], create: ["XL"], remove: [] });
  });

  it("removing a value removes only that variant", () => {
    const existing = [v("s", 0, { Size: "S" }), v("m", 1, { Size: "M" })];
    expect(titles(planVariants([{ name: "Size", values: ["M"] }], existing))).toEqual({
      keep: ["m→M"],
      create: [],
      remove: ["s"],
    });
  });

  it("matches values case-insensitively and survives reordering", () => {
    const existing = [v("s", 0, { size: "s" }), v("m", 1, { size: "M" })];
    const p = planVariants([{ name: "Size", values: ["M", "S"] }], existing);
    expect(titles(p)).toEqual({ keep: ["s→S", "m→M"], create: [], remove: [] });
    expect(p.ordered.map(comboTitle)).toEqual(["M", "S"]);
  });

  it("adding an option maps existing variants to its first value", () => {
    const existing = [v("s", 0, { Size: "S" }), v("m", 1, { Size: "M" })];
    const p = planVariants(
      [
        { name: "Size", values: ["S", "M"] },
        { name: "Color", values: ["Red", "Blue"] },
      ],
      existing,
    );
    expect(titles(p)).toEqual({
      keep: ["s→S / Red", "m→M / Red"],
      create: ["S / Blue", "M / Blue"],
      remove: [],
    });
  });

  it("removing an option keeps the first variant per collapsed combination", () => {
    const existing = [
      v("sr", 0, { Size: "S", Color: "Red" }),
      v("sb", 1, { Size: "S", Color: "Blue" }),
      v("mr", 2, { Size: "M", Color: "Red" }),
    ];
    const p = planVariants([{ name: "Size", values: ["S", "M"] }], existing);
    expect(titles(p)).toEqual({ keep: ["sr→S", "mr→M"], create: [], remove: ["sb"] });
  });

  it("variable → simple keeps only the first variant as default", () => {
    const existing = [v("s", 0, { Size: "S" }), v("m", 1, { Size: "M" })];
    const p = planVariants([], existing);
    expect(titles(p)).toEqual({ keep: ["s→Default"], create: [], remove: ["m"] });
  });

  it("is a no-op when nothing changes", () => {
    const existing = [v("s", 0, { Size: "S" }), v("m", 1, { Size: "M" })];
    const p = planVariants([{ name: "Size", values: ["S", "M"] }], existing);
    expect(p.create).toEqual([]);
    expect(p.remove).toEqual([]);
  });
});
