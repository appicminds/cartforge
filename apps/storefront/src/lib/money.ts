/**
 * Minor units → localized currency string. Digits come from Intl, so JPY (0),
 * USD (2) and KWD (3) all format correctly.
 */
export function formatMoney(minor: number, currency: string, locale = "en-US"): string {
  const fmt = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  return fmt.format(minor / 10 ** digits);
}

export interface PriceView {
  /** "$19.99" or "From $19.99" */
  label: string;
  compareAt: string | null;
  onSale: boolean;
}

export function priceView(
  p: {
    price_min_minor: number | null;
    price_max_minor: number | null;
    compare_at_min_minor: number | null;
  },
  currency: string,
  locale?: string,
): PriceView | null {
  if (p.price_min_minor === null) return null;
  const min = formatMoney(p.price_min_minor, currency, locale);
  const ranged = p.price_max_minor !== null && p.price_max_minor !== p.price_min_minor;
  const onSale = p.compare_at_min_minor !== null && p.compare_at_min_minor > p.price_min_minor;
  return {
    label: ranged ? `From ${min}` : min,
    compareAt: onSale && !ranged ? formatMoney(p.compare_at_min_minor!, currency, locale) : null,
    onSale,
  };
}
