import { z } from "zod";

/**
 * Money is exchanged and stored as integer minor units (BE-005): USD 12.34 → 1234.
 * Never use floating point for amounts.
 */
export const MONEY_MAX_MINOR = 1_000_000_000_000; // 10^12 minor units

export const moneyMinorSchema = z
  .number({ message: "Enter an amount" })
  .int("Amount must be a whole number of minor units")
  .min(0, "Amount can't be negative")
  .max(MONEY_MAX_MINOR, "Amount is too large");

/** Number of minor-unit digits for an ISO 4217 currency (USD 2, JPY 0, KWD 3). */
export function currencyExponent(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/**
 * Parse a user-entered decimal ("12", "12.5", "1,234.50") into minor units without
 * floating-point arithmetic. Returns null for empty input, NaN for invalid input.
 */
export function parseMoneyToMinor(input: string, currency: string): number | null {
  const raw = input.trim().replace(/[\s,]/g, "");
  if (raw === "") return null;
  const exp = currencyExponent(currency);
  const re = exp === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{0,${exp}})?$|^\\.\\d{1,${exp}}$`);
  if (!re.test(raw)) return Number.NaN;
  const [whole = "0", frac = ""] = raw.split(".");
  const minor =
    BigInt(whole || "0") * 10n ** BigInt(exp) +
    BigInt((frac + "0".repeat(exp)).slice(0, exp) || "0");
  return minor > BigInt(MONEY_MAX_MINOR) ? Number.NaN : Number(minor);
}

/** Minor units → plain decimal string for inputs ("1234" USD → "12.34"). */
export function minorToDecimalString(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "";
  const exp = currencyExponent(currency);
  if (exp === 0) return String(minor);
  const s = String(Math.abs(minor)).padStart(exp + 1, "0");
  return `${minor < 0 ? "-" : ""}${s.slice(0, -exp)}.${s.slice(-exp)}`;
}

/** Locale-aware display ("$12.34"). Converts via string to avoid float rounding. */
export function formatMoney(minor: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    Number(minorToDecimalString(minor, currency)),
  );
}
