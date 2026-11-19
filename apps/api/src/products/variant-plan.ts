/**
 * Variant reconciliation (PRD §8.4 F): given the requested options and the
 * product's existing variants, decide which variants are kept (and keep their
 * SKU/price/stock), created or removed. Never silently overwrites: existing
 * variants are matched by option values, not by position.
 *
 * Matching rules:
 *  - Same options: a variant keeps its combination when all its values still exist.
 *  - Option added: existing variants take the new option's FIRST value.
 *  - Option removed: variants are projected onto the remaining options; when
 *    several collapse onto one combination, the first (by position) is kept.
 *  - Simple → variable: the default variant becomes the first combination.
 *  - Variable → simple (no options): the first variant is kept as the default.
 */
export interface OptionInput {
  name: string;
  values: string[];
}

export interface ExistingVariant {
  id: string;
  title: string;
  position: number;
  /** option name → value; empty for a default variant */
  values: Record<string, string>;
}

/** One value per option, in option order. */
export type Combination = string[];

export interface PlannedKeep {
  variant_id: string;
  from_title: string;
  combination: Combination;
}

export interface Plan {
  keep: PlannedKeep[];
  create: Combination[];
  remove: ExistingVariant[];
  /** All resulting combinations in display order. */
  ordered: Combination[];
}

const norm = (s: string) => s.trim().toLowerCase();

export function combinations(options: OptionInput[]): Combination[] {
  if (!options.length) return [[]];
  return options.reduce<Combination[]>(
    (acc, opt) => acc.flatMap((c) => opt.values.map((v) => [...c, v])),
    [[]],
  );
}

export const comboKey = (c: Combination) => c.map(norm).join("\u0000");
export const comboTitle = (c: Combination) => (c.length ? c.join(" / ") : "Default");

export function planVariants(options: OptionInput[], existing: ExistingVariant[]): Plan {
  const ordered = combinations(options);
  const byKey = new Map(ordered.map((c) => [comboKey(c), c]));
  const sorted = [...existing].sort((a, b) => a.position - b.position);

  const keep: PlannedKeep[] = [];
  const remove: ExistingVariant[] = [];
  const claimed = new Set<string>();

  for (const v of sorted) {
    const lookup = new Map(Object.entries(v.values).map(([k, val]) => [norm(k), val]));
    let target: Combination | undefined;
    if (!options.length) {
      // Becoming simple: only the first variant survives (as the default).
      target = claimed.size === 0 ? [] : undefined;
    } else if (lookup.size === 0) {
      // Default variant of a simple product → first combination.
      target = ordered[0];
    } else {
      const candidate = options.map((o) => {
        const have = lookup.get(norm(o.name));
        if (have === undefined) return o.values[0]!; // option added → first value
        return o.values.find((x) => norm(x) === norm(have)) ?? null; // value must still exist
      });
      target = candidate.every((x): x is string => x !== null)
        ? byKey.get(comboKey(candidate))
        : undefined;
    }

    if (target && !claimed.has(comboKey(target))) {
      claimed.add(comboKey(target));
      keep.push({ variant_id: v.id, from_title: v.title, combination: target });
    } else {
      remove.push(v);
    }
  }

  const create = ordered.filter((c) => !claimed.has(comboKey(c)));
  return { keep, create, remove, ordered };
}
