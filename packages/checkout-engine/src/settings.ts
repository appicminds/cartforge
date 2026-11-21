import { z } from "zod";
import { regionKey } from "./regions";

/**
 * Store checkout configuration (PRD §13.2 custom fields, terms; §18 tax basics;
 * §9 INV-003 reservation expiry; §14 manual payment methods).
 */
export const CUSTOM_FIELD_TYPES = ["text", "textarea", "checkbox", "select"] as const;

export const customFieldSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,39}$/, "Use lowercase letters, digits and underscores"),
    label: z.string().trim().min(1, "Enter a label").max(80),
    type: z.enum(CUSTOM_FIELD_TYPES),
    required: z.boolean().default(false),
    options: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    help: z.string().trim().max(200).default(""),
  })
  .superRefine((f, ctx) => {
    if (f.type === "select" && f.options.length < 2)
      ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least two choices" });
  });
export type CustomField = z.output<typeof customFieldSchema>;

const instructions = z.string().trim().max(1000).default("");

/** Pakistani mobile number as wallets and Raast use it: 03XXXXXXXXX (spaces, dashes, +92 accepted). */
const pkMobile = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, "").replace(/^\+?92/, "0"))
  .refine((v) => v === "" || /^03\d{9}$/.test(v), "Use a mobile number like 0300 1234567")
  .default("");

/** Pakistani IBAN: PK, 2 check digits, 4-letter bank code, 16 digits. */
const pkIban = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, "").toUpperCase())
  .refine(
    (v) => v === "" || /^PK\d{2}[A-Z]{4}\d{16}$/.test(v),
    "Use an IBAN like PK36 SCBL 0000 0011 2345 6702",
  )
  .default("");

export const taxRuleSchema = z.object({
  country: z.string().trim().toUpperCase().length(2, "Use a two-letter country code"),
  region: z.string().trim().max(80).default(""),
  rate_bps: z.number().int().min(0).max(10_000),
  label: z.string().trim().max(40).default(""),
});

export const checkoutSettingsSchema = z
  .object({
    /** 0–100% in basis points. */
    tax_rate_bps: z.number().int().min(0).max(10_000).default(0),
    tax_label: z.string().trim().min(1).max(40).default("Tax"),
    prices_include_tax: z.boolean().default(false),
    tax_shipping: z.boolean().default(false),
    /** Rates by country or province that override tax_rate_bps (most specific wins). */
    tax_rules: z
      .array(taxRuleSchema)
      .max(100, "Up to 100 tax rules")
      .default([])
      .superRefine((rules, ctx) => {
        const seen = new Set<string>();
        rules.forEach((r, i) => {
          const k = `${r.country}|${regionKey(r.country, r.region)}`;
          if (seen.has(k))
            ctx.addIssue({
              code: "custom",
              path: [i, "region"],
              message: "There's already a rule for this place",
            });
          seen.add(k);
        });
      }),
    phone: z.enum(["hidden", "optional", "required"]).default("optional"),
    /** Stock held for a shopper in checkout. */
    reservation_minutes: z.number().int().min(5).max(120).default(15),
    terms_required: z.boolean().default(false),
    terms_label: z.string().trim().max(200).default("I agree to the terms of service"),
    /** Internal path or https URL. */
    terms_url: z
      .string()
      .trim()
      .max(500)
      .refine(
        (v) => v === "" || /^\/(?!\/)/.test(v) || /^https:\/\//.test(v),
        "Use /a-path or an https:// link",
      )
      .default(""),
    custom_fields: z
      .array(customFieldSchema)
      .max(5, "Up to 5 custom fields")
      .default([])
      .refine((f) => new Set(f.map((x) => x.key)).size === f.length, "Field keys must be unique"),
    cod_enabled: z.boolean().default(false),
    cod_instructions: instructions,
    bank_transfer_enabled: z.boolean().default(false),
    bank_transfer_instructions: instructions,
    // Mobile wallet / Raast transfer (Pakistan).
    wallet_enabled: z.boolean().default(false),
    wallet_jazzcash: pkMobile,
    wallet_easypaisa: pkMobile,
    wallet_raast_id: pkMobile,
    wallet_iban: pkIban,
    wallet_account_title: z.string().trim().max(100).default(""),
    wallet_note: z.string().trim().max(500).default(""),
  })
  .superRefine((s, ctx) => {
    if (s.wallet_enabled) {
      if (!s.wallet_jazzcash && !s.wallet_easypaisa && !s.wallet_raast_id && !s.wallet_iban)
        ctx.addIssue({
          code: "custom",
          path: ["wallet_jazzcash"],
          message: "Add at least one wallet number, Raast ID or IBAN",
        });
      if (!s.wallet_account_title)
        ctx.addIssue({
          code: "custom",
          path: ["wallet_account_title"],
          message: "Add the account title customers will see",
        });
    }
    if (s.bank_transfer_enabled && !s.bank_transfer_instructions)
      ctx.addIssue({
        code: "custom",
        path: ["bank_transfer_instructions"],
        message: "Tell customers where to send the payment",
      });
  });
export type CheckoutSettings = z.output<typeof checkoutSettingsSchema>;
export type CheckoutSettingsInput = z.input<typeof checkoutSettingsSchema>;

export const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = checkoutSettingsSchema.parse({});

const placeList = (max: number) =>
  z
    .array(z.string().trim().min(1).max(80))
    .max(max)
    .default([])
    .transform((list) => {
      const seen = new Set<string>();
      return list.filter((v) => {
        const k = v.toLowerCase();
        return seen.has(k) ? false : (seen.add(k), true);
      });
    });
const optionalMinor = z.number().int().min(0).max(1_000_000_000).nullable().default(null);
const optionalDays = z.number().int().min(0).max(365).nullable().default(null);

/** The fields alone (for partial updates); validate the merged result with shippingMethodSchema. */
export const shippingMethodFields = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  description: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
  price_minor: z.number().int().min(0).max(100_000_000),
  free_over_minor: optionalMinor,
  countries: z
    .array(z.string().trim().toUpperCase().length(2))
    .max(250)
    .default([])
    .transform((c) => [...new Set(c)].sort()),
  /** Provinces/states; needs exactly one country to be meaningful. */
  regions: placeList(100),
  cities: placeList(200),
  min_order_minor: optionalMinor,
  max_order_minor: optionalMinor,
  per_item_minor: z.number().int().min(0).max(100_000_000).default(0),
  min_days: optionalDays,
  max_days: optionalDays,
  active: z.boolean().default(true),
});

export const shippingMethodSchema = shippingMethodFields.superRefine((m, ctx) => {
  if ((m.regions.length || m.cities.length) && m.countries.length !== 1)
    ctx.addIssue({
      code: "custom",
      path: [m.regions.length ? "regions" : "cities"],
      message: "Choose exactly one country to limit by province or city",
    });
  if (
    m.min_order_minor != null &&
    m.max_order_minor != null &&
    m.min_order_minor > m.max_order_minor
  )
    ctx.addIssue({
      code: "custom",
      path: ["max_order_minor"],
      message: "Must be at least the minimum order",
    });
  if (m.min_days != null && m.max_days != null && m.min_days > m.max_days)
    ctx.addIssue({
      code: "custom",
      path: ["max_days"],
      message: "Must be at least the minimum days",
    });
});
export type ShippingMethodInput = z.input<typeof shippingMethodSchema>;
export type ShippingMethodData = z.output<typeof shippingMethodSchema>;

/** Validates submitted custom field values against the store's configuration. */
export function validateCustomFields(
  fields: CustomField[],
  values: Record<string, unknown>,
): { values: Record<string, string | boolean>; errors: { path: string; message: string }[] } {
  const out: Record<string, string | boolean> = {};
  const errors: { path: string; message: string }[] = [];
  for (const f of fields) {
    const raw = values[f.key];
    const path = `custom_fields.${f.key}`;
    if (f.type === "checkbox") {
      const v = raw === true || raw === "true" || raw === "on";
      if (f.required && !v) errors.push({ path, message: `${f.label} is required` });
      out[f.key] = v;
      continue;
    }
    const v = typeof raw === "string" ? raw.replace(/\p{Cc}/gu, " ").trim() : "";
    if (!v) {
      if (f.required) errors.push({ path, message: `${f.label} is required` });
      continue;
    }
    if (f.type === "select" && !f.options.includes(v)) {
      errors.push({ path, message: `Choose a valid option for ${f.label}` });
      continue;
    }
    const max = f.type === "textarea" ? 1000 : 200;
    if (v.length > max) {
      errors.push({ path, message: `${f.label} must be ${max} characters or fewer` });
      continue;
    }
    out[f.key] = v;
  }
  return { values: out, errors };
}
