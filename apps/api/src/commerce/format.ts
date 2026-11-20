/** Money for server-written messages ("$19.99"). Display formatting otherwise happens in the UI. */
export function formatMinor(minor: number, currency: string, locale = "en-US"): string {
  const fmt = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = fmt.resolvedOptions().maximumFractionDigits ?? 2;
  return fmt.format(minor / 10 ** digits);
}
