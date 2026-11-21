import { regionKey } from "./regions";

/**
 * Tax by destination (Next 7). A rule sets the rate for a country, or for one
 * province/state in it. The most specific matching rule wins; otherwise the
 * store's own rate applies. Rules don't add up (no combined state + city tax).
 */
export interface TaxRule {
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Province/state name or code; "" = the whole country. */
  region: string;
  /** 0–100% in basis points. */
  rate_bps: number;
  /** Shown at checkout instead of the store's label, e.g. "GST" or "PST"; "" = store label. */
  label: string;
}

export interface ResolvedTax {
  rate_bps: number;
  label: string;
  /** The rule used, or null for the store's default rate. */
  rule: TaxRule | null;
}

export function resolveTax(
  store: { tax_rate_bps: number; tax_label: string; tax_rules?: TaxRule[] },
  dest: { country?: string | null; region?: string | null } | null | undefined,
): ResolvedTax {
  const fallback = { rate_bps: store.tax_rate_bps, label: store.tax_label, rule: null };
  const cc = (dest?.country ?? "").toUpperCase();
  if (!cc || !store.tax_rules?.length) return fallback;
  const inCountry = store.tax_rules.filter((r) => r.country === cc);
  const key = regionKey(cc, dest?.region);
  const rule =
    (key && inCountry.find((r) => r.region && regionKey(cc, r.region) === key)) ||
    inCountry.find((r) => !r.region);
  return rule ? { rate_bps: rule.rate_bps, label: rule.label || store.tax_label, rule } : fallback;
}
