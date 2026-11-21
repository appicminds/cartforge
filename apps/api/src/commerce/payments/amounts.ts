import { currencyExponent } from "@cartforge/validation";

/**
 * CartForge stores money in the currency's standard minor unit (ISO/CLDR: USD 2
 * decimals, PKR and JPY 0, KWD 3). Gateways each count differently, so adapters
 * convert at the boundary — never inside the order.
 */
export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** currencyExponent(currency);
}

/** CartForge minor units → a gateway's unit with `digits` decimals (e.g. JazzCash paisa: 2). */
export function toUnits(minor: number, currency: string, digits: number): number {
  return Math.round(toMajor(minor, currency) * 10 ** digits);
}

/** A gateway's units back to CartForge minor units. */
export function fromUnits(units: number, currency: string, digits: number): number {
  return Math.round((units / 10 ** digits) * 10 ** currencyExponent(currency));
}

/** Stripe's own decimal table (stripe.com/docs/currencies). */
const STRIPE_ZERO = new Set(
  "BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF UGX VND VUV XAF XOF XPF".split(" "),
);
const STRIPE_THREE = new Set("BHD JOD KWD OMR TND".split(" "));
export const stripeDigits = (currency: string) =>
  STRIPE_ZERO.has(currency.toUpperCase()) ? 0 : STRIPE_THREE.has(currency.toUpperCase()) ? 3 : 2;
