import { z } from "zod";

const target = z
  .object({
    all: z.boolean().default(false),
    product_ids: z.array(z.string().uuid()).max(500).default([]),
    collection_ids: z.array(z.string().uuid()).max(100).default([]),
  })
  .strict();

/** Run a sale (Discounts → Sales). Fixed amounts are in the store currency. */
export const saleSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a name").max(120),
    value_type: z.enum(["percent", "fixed"]).default("percent"),
    /** percent: basis points (2000 = 20%); fixed: store-currency minor units. */
    value: z.number().int().min(0).max(1e12),
    target: target.default({ all: true, product_ids: [], collection_ids: [] }),
    existing: z.enum(["skip", "original", "current"]).default("skip"),
    rounding: z.enum(["none", "whole", "x9", "ten", "hundred"]).default("none"),
    /** Absent or in the past = start now. */
    starts_at: z.coerce.date().nullable().optional(),
    ends_at: z.coerce.date().nullable().default(null),
  })
  .strict()
  .superRefine((d, ctx) => {
    const add = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (d.value <= 0) add("value", "Enter a discount above 0");
    if (d.value_type === "percent" && d.value >= 10_000) add("value", "Less than 100%");
    if (!d.target.all && !d.target.product_ids.length && !d.target.collection_ids.length)
      add("target", "Choose products or collections, or all products");
    const start = d.starts_at ?? new Date();
    if (d.ends_at && d.ends_at <= start) add("ends_at", "Must be after the start");
  });
export type SaleInput = z.input<typeof saleSchema>;
export type SaleData = z.output<typeof saleSchema>;

/** A running sale: only the name and end date can change. */
export const saleRunningUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a name").max(120).optional(),
    ends_at: z.coerce.date().nullable().optional(),
  })
  .strict();
export type SaleRunningUpdate = z.output<typeof saleRunningUpdateSchema>;

export const saleProductsSchema = z
  .object({ product_ids: z.array(z.string().uuid()).min(1).max(500) })
  .strict();
