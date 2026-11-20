import type { StorefrontVariant } from "@cartforge/types";

export type Selection = Record<string, string>;

export const selectionOf = (v: StorefrontVariant): Selection =>
  Object.fromEntries(v.options.map((o) => [o.option, o.value]));

/** The variant matching every selected option, if that combination exists. */
export function findVariant(
  variants: StorefrontVariant[],
  sel: Selection,
): StorefrontVariant | undefined {
  return variants.find((v) => v.options.every((o) => sel[o.option] === o.value));
}

/** Starting variant: the one in the URL, else the first available, else the first. */
export function initialVariant(
  variants: StorefrontVariant[],
  requestedId?: string | null,
): StorefrontVariant | undefined {
  return (
    variants.find((v) => v.id === requestedId) ?? variants.find((v) => v.available) ?? variants[0]
  );
}

export type ValueState = "available" | "sold_out" | "unavailable";

/**
 * State of `value` for `option` given the other current selections: whether
 * picking it lands on a purchasable variant, a sold-out one, or no variant.
 */
export function valueState(
  variants: StorefrontVariant[],
  sel: Selection,
  option: string,
  value: string,
): ValueState {
  const v = findVariant(variants, { ...sel, [option]: value });
  if (!v) return "unavailable";
  return v.available ? "available" : "sold_out";
}

/** Picking a value that doesn't combine with the rest jumps to the closest real variant. */
export function choose(
  variants: StorefrontVariant[],
  sel: Selection,
  option: string,
  value: string,
): StorefrontVariant | undefined {
  const next = { ...sel, [option]: value };
  const exact = findVariant(variants, next);
  if (exact) return exact;
  const candidates = variants.filter((v) =>
    v.options.some((o) => o.option === option && o.value === value),
  );
  const score = (v: StorefrontVariant) =>
    v.options.filter((o) => next[o.option] === o.value).length + (v.available ? 0.5 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0];
}
