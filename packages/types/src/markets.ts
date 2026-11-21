/** Markets: one store selling to several countries, each with its own currency. */

export const MARKET_ERROR_CODES = {
  MARKET_NOT_FOUND: "MARKET_NOT_FOUND",
  MARKET_RATE_UNAVAILABLE: "MARKET_RATE_UNAVAILABLE",
  MARKET_COUNTRY_TAKEN: "MARKET_COUNTRY_TAKEN",
  PRIMARY_MARKET_LOCKED: "PRIMARY_MARKET_LOCKED",
} as const;

export type MarketPricingMode = "manual" | "live";
export type MarketRounding = "none" | "whole" | "x99" | "x9" | "five" | "ten";

export interface MarketView {
  id: string;
  name: string;
  currency: string;
  /** ISO country codes; empty on the primary market = every country no other market lists. */
  countries: string[];
  is_primary: boolean;
  active: boolean;
  pricing_mode: MarketPricingMode;
  /** Merchant's own rate: store-currency units per 1 market-currency unit ("1 AED = 76 PKR"). */
  manual_rate: number | null;
  /** The rate in use now (store units per 1 market unit), from either source. */
  rate: number | null;
  rate_source: "store" | "manual" | "live" | "unavailable";
  /** When the live rate was fetched. */
  rate_updated_at: string | null;
  adjustment_bps: number;
  rounding: MarketRounding;
  /** Payment method keys offered in this market; empty = every method that takes its currency. */
  payment_methods: string[];
  /** How a sample store price shows in this market. */
  example: { store_minor: number; market_minor: number } | null;
}

export interface MarketsOverview {
  store_currency: string;
  /** Whether a live exchange-rate source is configured on this server. */
  live_rates_available: boolean;
  markets: MarketView[];
}

/** What the storefront needs to pick and show a market. */
export interface StorefrontMarket {
  id: string;
  name: string;
  currency: string;
  countries: string[];
  is_primary: boolean;
}

/** Fixed prices for one product in one market (blank = converted). */
export interface MarketPriceRow {
  variant_id: string;
  variant_title: string;
  /** Converted from the store price (what applies without a fixed price). */
  converted_minor: number | null;
  price_minor: number | null;
  compare_at_minor: number | null;
}

export interface ProductMarketsView {
  /** Markets this product is hidden from. */
  hidden_market_ids: string[];
  markets: { id: string; name: string; currency: string; is_primary: boolean; rows: MarketPriceRow[] }[];
}
