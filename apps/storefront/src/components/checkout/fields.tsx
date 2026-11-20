"use client";

import { useMemo, useState } from "react";
import type { CommerceAddress } from "@/lib/commerce-types";

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm text-sale">
      {message}
    </p>
  );
}

export function Field({
  name,
  label,
  errors,
  defaultValue,
  type = "text",
  autoComplete,
  required = false,
  className = "",
  inputMode,
}: {
  name: string;
  label: string;
  errors?: Record<string, string>;
  defaultValue?: string | null;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  className?: string;
  inputMode?: "email" | "tel" | "text" | "numeric";
}) {
  const err = errors?.[name];
  const id = `f-${name.replace(/\W/g, "-")}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm">
        {label}
        {!required && <span className="text-muted"> (optional)</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        autoComplete={autoComplete}
        inputMode={inputMode}
        required={required}
        aria-invalid={err ? true : undefined}
        aria-describedby={err ? `${id}-err` : undefined}
        className={`sf-field w-full ${err ? "border-sale" : ""}`}
      />
      <FieldError id={`${id}-err`} message={err} />
    </div>
  );
}

const REGION_REQUIRED = new Set(["US", "CA", "AU", "BR", "MX", "IN", "AR", "CN", "JP", "MY"]);

/** Address block; field names are `${prefix}.field` to match the API's error paths. */
export function AddressFields({
  prefix,
  value,
  countries,
  errors,
  locale,
  withPhone = false,
  phoneRequired = false,
}: {
  prefix: "shipping_address" | "billing_address";
  value: CommerceAddress | null;
  /** null = any country. */
  countries: string[] | null;
  errors?: Record<string, string>;
  locale?: string;
  withPhone?: boolean;
  phoneRequired?: boolean;
}) {
  const options = useMemo(() => {
    const names = new Intl.DisplayNames([locale ?? "en"], { type: "region" });
    const codes = countries ?? ALL_COUNTRIES;
    return codes
      .map((c) => ({ code: c, name: names.of(c) ?? c }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countries, locale]);
  const [country, setCountry] = useState(
    value?.country ??
      (options.length === 1
        ? options[0]!.code
        : (options.find((o) => o.code === "US")?.code ?? "")),
  );
  const n = (f: string) => `${prefix}.${f}`;
  const ac = prefix === "shipping_address" ? "shipping" : "billing";
  const countryErr = errors?.[n("country")];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`f-${prefix}-country`} className="mb-1 block text-sm">
          Country / region
        </label>
        <select
          id={`f-${prefix}-country`}
          name={n("country")}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          autoComplete={`${ac} country`}
          required
          aria-invalid={countryErr ? true : undefined}
          aria-describedby={countryErr ? `f-${prefix}-country-err` : undefined}
          className="sf-field sf-select w-full"
        >
          <option value="" disabled>
            Choose…
          </option>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </select>
        <FieldError id={`f-${prefix}-country-err`} message={countryErr} />
      </div>
      <Field
        name={n("first_name")}
        label="First name"
        defaultValue={value?.first_name}
        autoComplete={`${ac} given-name`}
        errors={errors}
      />
      <Field
        name={n("last_name")}
        label="Last name"
        defaultValue={value?.last_name}
        autoComplete={`${ac} family-name`}
        errors={errors}
        required
      />
      <Field
        name={n("company")}
        label="Company"
        defaultValue={value?.company}
        autoComplete={`${ac} organization`}
        errors={errors}
        className="sm:col-span-2"
      />
      <Field
        name={n("address1")}
        label="Address"
        defaultValue={value?.address1}
        autoComplete={`${ac} address-line1`}
        errors={errors}
        required
        className="sm:col-span-2"
      />
      <Field
        name={n("address2")}
        label="Apartment, suite, etc."
        defaultValue={value?.address2}
        autoComplete={`${ac} address-line2`}
        errors={errors}
        className="sm:col-span-2"
      />
      <Field
        name={n("city")}
        label="City"
        defaultValue={value?.city}
        autoComplete={`${ac} address-level2`}
        errors={errors}
        required
      />
      <Field
        name={n("region")}
        label="State / province"
        defaultValue={value?.region}
        autoComplete={`${ac} address-level1`}
        errors={errors}
        required={REGION_REQUIRED.has(country)}
      />
      <Field
        name={n("postal_code")}
        label="Postal code"
        defaultValue={value?.postal_code}
        autoComplete={`${ac} postal-code`}
        errors={errors}
        required
      />
      {withPhone && (
        <Field
          name={n("phone")}
          label="Phone"
          type="tel"
          inputMode="tel"
          defaultValue={value?.phone}
          autoComplete={`${ac} tel`}
          errors={errors}
          required={phoneRequired}
        />
      )}
    </div>
  );
}

export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-[var(--sf-radius)] border border-sale p-3 text-sm text-sale">
      {message}
    </p>
  );
}

// prettier-ignore
const ALL_COUNTRIES = ["AD","AE","AG","AL","AM","AO","AR","AT","AU","AZ","BA","BB","BD","BE","BG","BH","BN","BO","BR","BS","BW","BY","BZ","CA","CH","CL","CN","CO","CR","CY","CZ","DE","DK","DO","DZ","EC","EE","EG","ES","FI","FJ","FR","GB","GE","GH","GR","GT","HK","HN","HR","HU","ID","IE","IL","IN","IS","IT","JM","JO","JP","KE","KH","KR","KW","KZ","LB","LI","LK","LT","LU","LV","MA","MC","MD","ME","MK","MN","MO","MT","MU","MX","MY","NG","NI","NL","NO","NP","NZ","OM","PA","PE","PH","PK","PL","PR","PT","PY","QA","RO","RS","SA","SE","SG","SI","SK","SN","SV","TH","TN","TR","TT","TW","TZ","UA","UG","US","UY","UZ","VN","ZA","ZM"];
