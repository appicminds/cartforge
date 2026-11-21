import { normalizePlace, regionKey } from "./regions";

/**
 * Shipping methods (PRD §17: "checkout must show only methods valid for
 * destination and cart"; "rates recalculated server-side"). Next 7 adds
 * provinces/cities, order-value limits, a per-item charge and delivery estimates.
 */
export interface ShippingMethodConfig {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  /** Free when the shippable subtotal reaches this; null = never free. */
  free_over_minor: number | null;
  /** ISO 3166-1 alpha-2; empty = ships everywhere. */
  countries: string[];
  /** Provinces/states (names or ISO 3166-2 codes); empty = the whole country. */
  regions?: string[];
  /** Cities; empty = every city. */
  cities?: string[];
  /** Offered only when the shippable subtotal is at least / at most this. */
  min_order_minor?: number | null;
  max_order_minor?: number | null;
  /** Added for each shippable item after the first. */
  per_item_minor?: number;
  /** Delivery estimate in days (either may be null). */
  min_days?: number | null;
  max_days?: number | null;
  active: boolean;
}

export interface ShippingDestination {
  country: string | null | undefined;
  region?: string | null;
  city?: string | null;
}

export interface ShippingQuote {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  /** True when the free-shipping threshold made it free. */
  free: boolean;
  /** e.g. { min_days: 2, max_days: 4 }; null = no estimate. */
  estimate: { min_days: number | null; max_days: number | null } | null;
}

/** Whether a method delivers to this destination (ignores cart value). */
export function shipsTo(m: ShippingMethodConfig, dest: ShippingDestination): boolean {
  const cc = (dest.country ?? "").toUpperCase();
  if (!cc) return false;
  if (m.countries.length && !m.countries.includes(cc)) return false;
  if (m.regions?.length) {
    const key = regionKey(cc, dest.region);
    if (!key || !m.regions.some((r) => regionKey(cc, r) === key)) return false;
  }
  if (m.cities?.length) {
    const city = normalizePlace(dest.city);
    if (!city || !m.cities.some((c) => normalizePlace(c) === city)) return false;
  }
  return true;
}

/** Valid methods for a destination and cart, cheapest first. */
export function quoteShipping(
  methods: ShippingMethodConfig[],
  dest: ShippingDestination | string | null | undefined,
  shippableSubtotal: number,
  shippableQuantity = 1,
): ShippingQuote[] {
  const d: ShippingDestination = typeof dest === "object" && dest ? dest : { country: dest };
  if (!d.country) return [];
  return methods
    .filter(
      (m) =>
        m.active &&
        shipsTo(m, d) &&
        (m.min_order_minor == null || shippableSubtotal >= m.min_order_minor) &&
        (m.max_order_minor == null || shippableSubtotal <= m.max_order_minor),
    )
    .map((m) => {
      const base = m.price_minor + (m.per_item_minor ?? 0) * Math.max(0, shippableQuantity - 1);
      const free = m.free_over_minor != null && shippableSubtotal >= m.free_over_minor;
      const hasEstimate = m.min_days != null || m.max_days != null;
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        price_minor: free ? 0 : base,
        free: free && base > 0,
        estimate: hasEstimate
          ? { min_days: m.min_days ?? null, max_days: m.max_days ?? null }
          : null,
      };
    })
    .sort((a, b) => a.price_minor - b.price_minor || a.name.localeCompare(b.name));
}

/** Countries any active method ships to; null = everywhere. */
export function shippingCountries(methods: ShippingMethodConfig[]): string[] | null {
  const active = methods.filter((m) => m.active);
  if (active.some((m) => m.countries.length === 0)) return null;
  return [...new Set(active.flatMap((m) => m.countries))].sort();
}

/** "2–4 business days", "Up to 5 days", "1 day"… or null. */
export function describeEstimate(e: ShippingQuote["estimate"]): string | null {
  if (!e) return null;
  const { min_days: lo, max_days: hi } = e;
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  if (lo != null && hi != null) return lo === hi ? days(lo) : `${lo}–${days(hi)}`;
  if (hi != null) return `Up to ${days(hi)}`;
  if (lo != null) return `${days(lo)} or more`;
  return null;
}
