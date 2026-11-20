/**
 * Deterministic order totals (PRD §13.3 rules 11–12, §18 "deterministic and
 * recorded"). Inputs come from the server's catalog and settings only; all
 * amounts are integer minor units. Rounding is half-up per line, and the order
 * tax is the sum of the line taxes, so line and order snapshots always agree.
 */
export interface TotalsLineInput {
  /** Caller's id for the line (echoed back). */
  key: string;
  unit_price_minor: number;
  quantity: number;
  /** Lines that don't ship (digital, services) don't count toward free shipping thresholds. */
  requires_shipping: boolean;
}

export interface TaxSettings {
  /** Basis points: 2000 = 20%. 0 = no tax. */
  rate_bps: number;
  /** Prices already include tax (VAT style) vs tax added on top (US style). */
  prices_include_tax: boolean;
  /** Whether the shipping charge is taxed at the same rate. */
  tax_shipping: boolean;
}

export interface TotalsInput {
  lines: TotalsLineInput[];
  /** Selected method's charge for this cart, already resolved (see shipping.ts). 0 when none. */
  shipping_minor: number;
  /** Order-level discount, distributed across lines in proportion (Next 8). */
  discount_minor?: number;
  tax: TaxSettings;
}

export interface TotalsLine {
  key: string;
  quantity: number;
  unit_price_minor: number;
  /** unit × quantity */
  line_subtotal_minor: number;
  discount_minor: number;
  /** Tax contained in (inclusive) or added to (exclusive) this line. */
  tax_minor: number;
}

export interface Totals {
  lines: TotalsLine[];
  /** Sum of line subtotals, as displayed (inclusive prices stay inclusive). */
  subtotal_minor: number;
  discount_minor: number;
  shipping_minor: number;
  shipping_tax_minor: number;
  /** All tax: included in prices (inclusive) or added on top (exclusive). */
  tax_minor: number;
  /** What the customer pays. */
  total_minor: number;
  prices_include_tax: boolean;
}

/** a × b / c rounded half-up, exact for non-negative safe integers. */
export function mulDivRound(a: number, b: number, c: number): number {
  const n = BigInt(a) * BigInt(b);
  const d = BigInt(c);
  return Number((n * 2n + d) / (2n * d));
}

/** Tax on an amount: added on top (exclusive) or contained within it (inclusive). */
export function taxOn(amount: number, rateBps: number, inclusive: boolean): number {
  if (rateBps <= 0 || amount <= 0) return 0;
  return inclusive
    ? amount - mulDivRound(amount, 10_000, 10_000 + rateBps)
    : mulDivRound(amount, rateBps, 10_000);
}

/** Split `total` across `weights` proportionally; remainders go to the largest weights first. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => Math.floor((w * total) / sum));
  let rest = total - exact.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => ({ w, i })).sort((a, b) => b.w - a.w || a.i - b.i);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) exact[order[k]!.i]! += 1;
  return exact;
}

function assertMinor(n: number, what: string) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(`${what} must be a non-negative integer`);
}

export function computeTotals(input: TotalsInput): Totals {
  const { tax } = input;
  if (!Number.isInteger(tax.rate_bps) || tax.rate_bps < 0 || tax.rate_bps > 10_000)
    throw new RangeError("rate_bps must be 0–10000");
  assertMinor(input.shipping_minor, "shipping_minor");
  for (const l of input.lines) {
    assertMinor(l.unit_price_minor, "unit_price_minor");
    if (!Number.isInteger(l.quantity) || l.quantity < 1)
      throw new RangeError("quantity must be ≥ 1");
  }
  const subtotals = input.lines.map((l) => l.unit_price_minor * l.quantity);
  const subtotal = subtotals.reduce((a, b) => a + b, 0);
  const discount = Math.min(input.discount_minor ?? 0, subtotal);
  assertMinor(discount, "discount_minor");
  const discounts = allocate(discount, subtotals);

  const lines: TotalsLine[] = input.lines.map((l, i) => {
    const taxable = subtotals[i]! - discounts[i]!;
    return {
      key: l.key,
      quantity: l.quantity,
      unit_price_minor: l.unit_price_minor,
      line_subtotal_minor: subtotals[i]!,
      discount_minor: discounts[i]!,
      tax_minor: taxOn(taxable, tax.rate_bps, tax.prices_include_tax),
    };
  });
  const shippingTax = tax.tax_shipping
    ? taxOn(input.shipping_minor, tax.rate_bps, tax.prices_include_tax)
    : 0;
  const lineTax = lines.reduce((a, l) => a + l.tax_minor, 0);
  const taxTotal = lineTax + shippingTax;
  const goods = subtotal - discount + input.shipping_minor;
  return {
    lines,
    subtotal_minor: subtotal,
    discount_minor: discount,
    shipping_minor: input.shipping_minor,
    shipping_tax_minor: shippingTax,
    tax_minor: taxTotal,
    total_minor: tax.prices_include_tax ? goods : goods + taxTotal,
    prices_include_tax: tax.prices_include_tax,
  };
}
