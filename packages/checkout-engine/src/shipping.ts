/**
 * Flat-rate shipping methods (PRD §17: "checkout must show only methods valid for
 * destination and cart"; "rates recalculated server-side"). Zones, weights and
 * carrier rates arrive with Shipping Management (Next 7) behind the same shape.
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
  active: boolean;
}

export interface ShippingQuote {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  /** True when the free-shipping threshold made it free. */
  free: boolean;
}

/** Valid methods for a destination and cart, cheapest first. */
export function quoteShipping(
  methods: ShippingMethodConfig[],
  country: string | null | undefined,
  shippableSubtotal: number,
): ShippingQuote[] {
  if (!country) return [];
  const cc = country.toUpperCase();
  return methods
    .filter((m) => m.active && (m.countries.length === 0 || m.countries.includes(cc)))
    .map((m) => {
      const free = m.free_over_minor !== null && shippableSubtotal >= m.free_over_minor;
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        price_minor: free ? 0 : m.price_minor,
        free: free && m.price_minor > 0,
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
