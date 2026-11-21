/**
 * Discounts (Next 8): what a set of discounts is worth for a cart. Pure — the
 * API decides which discounts are live (dates, usage limits, markets, codes) and
 * converts fixed amounts into the cart's currency; this file does the maths.
 *
 * Kinds (as in Shopify):
 * - order:    % or fixed off the order (after product discounts)
 * - products: % or fixed off each eligible item
 * - bxgy:     buy N eligible items, get M eligible items at % off (100% = free)
 * - shipping: free shipping
 */

export type DiscountKind = "order" | "products" | "bxgy" | "shipping";
export type DiscountValueType = "percent" | "fixed";

/** Which items a rule looks at: everything, or these products / collections. */
export interface DiscountTarget {
  all: boolean;
  product_ids: string[];
  collection_ids: string[];
}

export interface DiscountRule {
  id: string;
  title: string;
  /** null = automatic. */
  code: string | null;
  kind: DiscountKind;
  value_type: DiscountValueType;
  /** percent: basis points (1000 = 10%); fixed: minor units of the cart currency. */
  value: number;
  /** products/bxgy: the items it applies to (bxgy: the "get" items). */
  target: DiscountTarget;
  /** Minimum spend (cart currency minor units) or item count; on eligible items for products/bxgy. */
  min_subtotal_minor: number | null;
  min_quantity: number | null;
  /** bxgy only. */
  buy?: { quantity: number; target: DiscountTarget; get_quantity: number; max_uses: number | null };
  /** May apply together with other combinable discounts. */
  combines: boolean;
}

export interface DiscountLine {
  key: string;
  product_id: string;
  collection_ids: string[];
  unit_price_minor: number;
  quantity: number;
}

export type NotApplied =
  | { reason: "min_subtotal"; missing_minor: number }
  | { reason: "min_quantity"; missing: number }
  | { reason: "no_items" }
  | { reason: "no_shipping" };

export interface DiscountResult {
  rule: DiscountRule;
  /** Total saved (lines + shipping). */
  amount_minor: number;
  /** Per line key (products / bxgy / order spread later by totals). */
  line_minor: Map<string, number>;
  /** Order-level amount, spread across lines by the totals engine. */
  order_minor: number;
  shipping_minor: number;
}

const matches = (t: DiscountTarget, l: DiscountLine) =>
  t.all ||
  t.product_ids.includes(l.product_id) ||
  l.collection_ids.some((c) => t.collection_ids.includes(c));

const pct = (amount: number, bps: number) => Math.round((amount * bps) / 10_000);

function minimums(rule: DiscountRule, subtotal: number, quantity: number): NotApplied | null {
  if (rule.min_subtotal_minor !== null && subtotal < rule.min_subtotal_minor)
    return { reason: "min_subtotal", missing_minor: rule.min_subtotal_minor - subtotal };
  if (rule.min_quantity !== null && quantity < rule.min_quantity)
    return { reason: "min_quantity", missing: rule.min_quantity - quantity };
  return null;
}

/**
 * One rule on its own. `prior` = line discounts already taken by product-level
 * discounts in the same combination (an order discount applies after them).
 */
export function evaluateDiscount(
  rule: DiscountRule,
  lines: DiscountLine[],
  shippingMinor: number | null,
  prior: Map<string, number> = new Map(),
): DiscountResult | NotApplied {
  const empty = { line_minor: new Map<string, number>(), order_minor: 0, shipping_minor: 0 };
  const sub = (ls: DiscountLine[]) => ls.reduce((a, l) => a + l.unit_price_minor * l.quantity, 0);
  const qty = (ls: DiscountLine[]) => ls.reduce((a, l) => a + l.quantity, 0);

  switch (rule.kind) {
    case "order": {
      const miss = minimums(rule, sub(lines), qty(lines));
      if (miss) return miss;
      const base = sub(lines) - [...prior.values()].reduce((a, b) => a + b, 0);
      if (base <= 0) return { reason: "no_items" };
      const amount = Math.min(
        base,
        rule.value_type === "percent" ? pct(base, rule.value) : rule.value,
      );
      return { rule, ...empty, amount_minor: amount, order_minor: amount };
    }
    case "products": {
      const eligible = lines.filter((l) => matches(rule.target, l));
      if (!eligible.length) return { reason: "no_items" };
      const miss = minimums(rule, sub(eligible), qty(eligible));
      if (miss) return miss;
      const line_minor = new Map<string, number>();
      for (const l of eligible) {
        const subtotal = l.unit_price_minor * l.quantity;
        const off =
          rule.value_type === "percent"
            ? pct(subtotal, rule.value)
            : Math.min(rule.value, l.unit_price_minor) * l.quantity;
        if (off > 0) line_minor.set(l.key, Math.min(off, subtotal));
      }
      const amount = [...line_minor.values()].reduce((a, b) => a + b, 0);
      if (!amount) return { reason: "no_items" };
      return { rule, ...empty, line_minor, amount_minor: amount };
    }
    case "bxgy": {
      const b = rule.buy!;
      // One entry per unit; "get" units are the cheapest eligible ones, "buy" units the rest.
      const units = lines.flatMap((l) =>
        Array.from({ length: l.quantity }, () => ({
          key: l.key,
          price: l.unit_price_minor,
          buy: matches(b.target, l),
          get: matches(rule.target, l),
        })),
      );
      const buyUnits = units.filter((u) => u.buy);
      const miss = minimums(
        rule,
        buyUnits.reduce((a, u) => a + u.price, 0),
        buyUnits.length,
      );
      if (miss) return miss;
      const gets = units.filter((u) => u.get).sort((x, y) => x.price - y.price);
      let n = Math.floor(buyUnits.length / b.quantity);
      if (b.max_uses !== null) n = Math.min(n, b.max_uses);
      for (; n > 0; n--) {
        const chosen = gets.slice(0, n * b.get_quantity);
        if (chosen.length < n * b.get_quantity) continue;
        // The buy side must still be met by units not given away.
        const left = buyUnits.filter((u) => !chosen.includes(u)).length;
        if (left >= n * b.quantity) {
          const line_minor = new Map<string, number>();
          for (const u of chosen) {
            const off =
              rule.value_type === "percent"
                ? pct(u.price, rule.value)
                : Math.min(rule.value, u.price);
            line_minor.set(u.key, (line_minor.get(u.key) ?? 0) + off);
          }
          const amount = [...line_minor.values()].reduce((a, v) => a + v, 0);
          if (amount > 0) return { rule, ...empty, line_minor, amount_minor: amount };
        }
      }
      return {
        reason: "min_quantity",
        missing: Math.max(
          1,
          b.quantity + b.get_quantity - units.filter((u) => u.buy || u.get).length,
        ),
      };
    }
    case "shipping": {
      if (shippingMinor === null) return { reason: "no_shipping" };
      const miss = minimums(rule, sub(lines), qty(lines));
      if (miss) return miss;
      return { rule, ...empty, amount_minor: shippingMinor, shipping_minor: shippingMinor };
    }
  }
}

export interface DiscountSelection {
  applied: DiscountResult[];
  /** Per line key: product-level discounts (bxgy + products). */
  line_minor: Map<string, number>;
  order_minor: number;
  shipping_minor: number;
  total_minor: number;
}

const isResult = (r: DiscountResult | NotApplied): r is DiscountResult => "rule" in r;

/** Evaluates a set in a fixed order: item discounts, then order, then shipping. */
function evaluateSet(
  rules: DiscountRule[],
  lines: DiscountLine[],
  shippingMinor: number | null,
): DiscountSelection {
  const order = { products: 0, bxgy: 0, order: 1, shipping: 2 };
  const sorted = [...rules].sort((a, b) => order[a.kind] - order[b.kind]);
  const line_minor = new Map<string, number>();
  const applied: DiscountResult[] = [];
  let orderMinor = 0;
  let shipping = 0;
  for (const rule of sorted) {
    const r = evaluateDiscount(rule, lines, shippingMinor, line_minor);
    if (!isResult(r)) continue;
    if (rule.kind === "products" || rule.kind === "bxgy") {
      // Item discounts never take a line below zero.
      for (const [k, v] of r.line_minor) {
        const l = lines.find((x) => x.key === k)!;
        const room = l.unit_price_minor * l.quantity - (line_minor.get(k) ?? 0);
        const take = Math.min(v, room);
        if (take > 0) line_minor.set(k, (line_minor.get(k) ?? 0) + take);
      }
    }
    orderMinor += r.order_minor;
    shipping += r.shipping_minor;
    applied.push(r);
  }
  const lineTotal = [...line_minor.values()].reduce((a, b) => a + b, 0);
  return {
    applied,
    line_minor,
    order_minor: orderMinor,
    shipping_minor: Math.min(shipping, shippingMinor ?? 0),
    total_minor: lineTotal + orderMinor + Math.min(shipping, shippingMinor ?? 0),
  };
}

/**
 * The best deal for the shopper from the available discounts (automatic ones
 * plus an entered code): each discount alone, or all combinable ones together
 * (at most one of each kind, the best of each). Ties prefer the entered code.
 */
export function selectDiscounts(
  rules: DiscountRule[],
  lines: DiscountLine[],
  shippingMinor: number | null,
): DiscountSelection {
  const candidates: DiscountRule[][] = rules.map((r) => [r]);
  const combinable = rules.filter((r) => r.combines);
  if (combinable.length > 1) {
    const bestOf = (kinds: DiscountKind[]) =>
      combinable
        .filter((r) => kinds.includes(r.kind))
        .map((r) => ({ r, v: evaluateSet([r], lines, shippingMinor).total_minor }))
        .sort((a, b) => b.v - a.v)[0]?.r;
    const set = [bestOf(["products", "bxgy"]), bestOf(["order"]), bestOf(["shipping"])].filter(
      (r): r is DiscountRule => !!r,
    );
    if (set.length > 1) candidates.push(set);
  }
  let best: DiscountSelection = {
    applied: [],
    line_minor: new Map(),
    order_minor: 0,
    shipping_minor: 0,
    total_minor: 0,
  };
  let bestHasCode = false;
  for (const set of candidates) {
    const s = evaluateSet(set, lines, shippingMinor);
    const hasCode = s.applied.some((a) => a.rule.code !== null);
    if (
      s.total_minor > best.total_minor ||
      (s.total_minor === best.total_minor && s.total_minor > 0 && hasCode && !bestHasCode)
    ) {
      best = s;
      bestHasCode = hasCode;
    }
  }
  return best;
}
