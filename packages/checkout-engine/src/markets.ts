/**
 * Markets (selling to several countries from one store): each market has a
 * currency, and prices come from the store's own prices through a rate (one the
 * merchant sets, or a live exchange rate), an optional adjustment and a rounding
 * rule — unless the merchant fixed a price for that product in that market.
 * Pure functions; the API supplies the rate.
 */

export const ROUNDING_RULES = ["none", "whole", "x99", "x9", "five", "ten"] as const;
export type RoundingRule = (typeof ROUNDING_RULES)[number];

export const ROUNDING_LABELS: Record<RoundingRule, string> = {
  none: "Don't round",
  whole: "Up to a whole amount (63.20 → 64)",
  x99: "Up to .99 (63.20 → 63.99)",
  x9: "Up to an amount ending in 9 (632 → 639)",
  five: "Up to the next 5 (632 → 635)",
  ten: "Up to the next 10 (632 → 640)",
};

/** Number of minor-unit digits for an ISO 4217 currency (USD 2, PKR 0 in CLDR, KWD 3). */
export function minorDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export interface MarketPricing {
  /** The store's own currency (prices are entered in it). */
  store_currency: string;
  /** The market's currency. */
  currency: string;
  /** Market currency units per 1 store currency unit (e.g. PKR→AED ≈ 0.0131). */
  rate: number;
  /** Percent in basis points added on top (1000 = +10%); may be negative. */
  adjustment_bps: number;
  rounding: RoundingRule;
}

/** Same currency, no change: the store's own market. */
export function isIdentity(p: MarketPricing): boolean {
  return p.currency === p.store_currency && p.rate === 1 && p.adjustment_bps === 0;
}

/** Strip float noise (0.1 + 0.2) before rounding up. */
const clean = (x: number) => Math.round(x * 1e6) / 1e6;

function applyRounding(major: number, rule: RoundingRule, digits: number): number {
  const x = clean(major);
  switch (rule) {
    case "whole":
      return Math.ceil(x);
    case "x99":
      // Whole-unit currencies (PKR, JPY) have no .99: round up to a whole amount instead.
      return digits >= 2 ? Math.floor(x) + 0.99 : Math.ceil(x);
    case "x9":
      return Math.ceil((x + 1) / 10) * 10 - 1;
    case "five":
      return Math.ceil(x / 5) * 5;
    case "ten":
      return Math.ceil(x / 10) * 10;
    default:
      return x;
  }
}

/**
 * A product price in the market's currency, in its minor units. `round` = false
 * converts exactly (used for shipping fees and thresholds, which aren't "prices").
 */
export function convertPrice(storeMinor: number, p: MarketPricing, round = true): number {
  if (isIdentity(p)) return storeMinor;
  const from = minorDigits(p.store_currency);
  const to = minorDigits(p.currency);
  let major = (storeMinor / 10 ** from) * p.rate;
  if (round) major *= 1 + p.adjustment_bps / 10_000;
  if (round) major = applyRounding(major, p.rounding, to);
  return Math.max(0, Math.round(clean(major) * 10 ** to));
}

/** A shipping fee or threshold: exact conversion, no adjustment or price rounding. */
export const convertAmount = (storeMinor: number, p: MarketPricing) =>
  convertPrice(storeMinor, p, false);

/** Back to the store's currency (for reporting order values). */
export function toStoreCurrency(marketMinor: number, p: MarketPricing): number {
  if (p.currency === p.store_currency && p.rate === 1) return marketMinor;
  const from = minorDigits(p.currency);
  const to = minorDigits(p.store_currency);
  return Math.round(clean((marketMinor / 10 ** from / p.rate) * 10 ** to));
}

export interface MarketForCountry {
  id: string;
  countries: string[];
  is_primary: boolean;
  active: boolean;
}

/**
 * The market a shopper in `country` belongs to: an active market listing that
 * country, else the primary market (which also covers every unlisted country).
 */
export function marketForCountry<M extends MarketForCountry>(
  markets: M[],
  country: string | null | undefined,
): M | undefined {
  const cc = (country ?? "").toUpperCase();
  const active = markets.filter((m) => m.active || m.is_primary);
  return (
    (cc && active.find((m) => !m.is_primary && m.countries.includes(cc))) ||
    active.find((m) => m.is_primary)
  );
}

/**
 * Countries a market ships to: its own list; for the primary market, its list or
 * — if empty — every country no other active market claims.
 */
export function marketCountries(
  market: MarketForCountry,
  markets: MarketForCountry[],
  all: readonly string[],
): string[] | null {
  if (market.countries.length) return market.countries;
  if (!market.is_primary) return [];
  const claimed = new Set(
    markets.filter((m) => !m.is_primary && m.active).flatMap((m) => m.countries),
  );
  return claimed.size ? all.filter((c) => !claimed.has(c)) : null;
}
