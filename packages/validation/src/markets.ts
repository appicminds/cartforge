import { z } from "zod";

const codes = z
  .array(z.string().trim().toUpperCase().length(2, "Use two-letter country codes"))
  .max(250)
  .transform((c) => [...new Set(c)].sort());

/** Add or edit a market (Settings → Markets). The primary market keeps the store currency. */
export const marketSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(60),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Choose a currency"),
    countries: codes.default([]),
    active: z.boolean().default(true),
    pricing_mode: z.enum(["manual", "live"]).default("manual"),
    /** Store-currency units per 1 market unit ("1 AED = 76 PKR"); needed for manual. */
    manual_rate: z.number().positive("Enter a rate above 0").max(1e9).nullable().default(null),
    adjustment_bps: z.number().int().min(-5000).max(10_000).default(0),
    rounding: z.enum(["none", "whole", "x99", "x9", "five", "ten"]).default("none"),
    payment_methods: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  })
  .strict();
export type MarketInput = z.input<typeof marketSchema>;
export type MarketData = z.output<typeof marketSchema>;

/** Product page: where it's sold and fixed prices per market. */
export const productMarketsSchema = z
  .object({
    hidden_market_ids: z.array(z.string().uuid()).max(50).default([]),
    prices: z
      .array(
        z.object({
          market_id: z.string().uuid(),
          variant_id: z.string().uuid(),
          /** null clears the fixed price (back to converted). */
          price_minor: z.number().int().min(0).max(1e12).nullable(),
          compare_at_minor: z.number().int().min(0).max(1e12).nullable().default(null),
        }),
      )
      .max(2000)
      .default([]),
  })
  .strict();
export type ProductMarketsInput = z.input<typeof productMarketsSchema>;
