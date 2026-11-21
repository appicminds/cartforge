/** "€48.00" / "¥4,800" / "KD 1.500" from integer minor units, using the currency's own decimals. */
export function formatMoney(minor: number | bigint, currency: string, locale = "en-US"): string {
  const nf = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = nf.resolvedOptions().maximumFractionDigits ?? 2;
  return nf.format(Number(minor) / 10 ** digits);
}
