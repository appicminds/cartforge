import { z } from "zod";

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

export const checkoutSettingsSchema = z
  .object({
    /** 0–100% in basis points. */
    tax_rate_bps: z.number().int().min(0).max(10_000).default(0),
    tax_label: z.string().trim().min(1).max(40).default("Tax"),
    prices_include_tax: z.boolean().default(false),
    tax_shipping: z.boolean().default(false),
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
  })
  .superRefine((s, ctx) => {
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

export const shippingMethodSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  description: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || null),
  price_minor: z.number().int().min(0).max(100_000_000),
  free_over_minor: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
  countries: z
    .array(z.string().trim().toUpperCase().length(2))
    .max(250)
    .default([])
    .transform((c) => [...new Set(c)].sort()),
  active: z.boolean().default(true),
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
