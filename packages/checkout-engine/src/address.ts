import { z } from "zod";
import { isCountryCode, NO_POSTAL_CODE, REGION_REQUIRED } from "./countries";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .transform((v) => v.replace(/\p{Cc}/gu, " "));
const required = (max: number, label: string) =>
  text(max).pipe(z.string().min(1, `Enter ${label}`));
const optional = (max: number) =>
  text(max)
    .nullish()
    .transform((v) => v || null);

export const PHONE_RE = /^\+?[0-9 ()./-]{6,25}$/;

/** A postal address as entered at checkout (PRD §13.2). Country-aware required fields. */
export const addressSchema = z
  .object({
    first_name: optional(80),
    last_name: required(80, "a last name"),
    company: optional(120),
    address1: required(200, "an address"),
    address2: optional(200),
    city: required(100, "a city"),
    region: optional(100),
    postal_code: optional(20),
    country: z.string().trim().toUpperCase().refine(isCountryCode, "Choose a country"),
    phone: optional(30).refine((v) => v === null || PHONE_RE.test(v), "Enter a valid phone number"),
  })
  .superRefine((a, ctx) => {
    if (REGION_REQUIRED.has(a.country) && !a.region)
      ctx.addIssue({ code: "custom", path: ["region"], message: "Enter a state / province" });
    if (!NO_POSTAL_CODE.has(a.country) && !a.postal_code)
      ctx.addIssue({ code: "custom", path: ["postal_code"], message: "Enter a postal code" });
    if (a.country === "US" && a.postal_code && !/^\d{5}(-\d{4})?$/.test(a.postal_code))
      ctx.addIssue({ code: "custom", path: ["postal_code"], message: "Enter a 5-digit ZIP code" });
  });
export type Address = z.output<typeof addressSchema>;
export type AddressInput = z.input<typeof addressSchema>;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address"));
