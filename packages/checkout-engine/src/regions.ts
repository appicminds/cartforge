/**
 * Provinces and states for countries where shipping and tax commonly differ by
 * region (Next 7). Codes are ISO 3166-2 suffixes; aliases are the other names
 * shoppers type, so "KPK", "Khyber Pakhtunkhwa" and "PK-KP" all match.
 * Countries not listed here keep a free-text region field and match by name.
 */
export interface Region {
  code: string;
  name: string;
  aliases?: string[];
}

export const REGIONS: Record<string, Region[]> = {
  PK: [
    { code: "PB", name: "Punjab" },
    { code: "SD", name: "Sindh" },
    { code: "KP", name: "Khyber Pakhtunkhwa", aliases: ["KPK", "NWFP", "Khyber Pakhtoonkhwa"] },
    { code: "BA", name: "Balochistan", aliases: ["Baluchistan"] },
    { code: "IS", name: "Islamabad Capital Territory", aliases: ["Islamabad", "ICT"] },
    { code: "GB", name: "Gilgit-Baltistan", aliases: ["Gilgit Baltistan", "GB"] },
    {
      code: "JK",
      name: "Azad Jammu and Kashmir",
      aliases: ["Azad Kashmir", "AJK", "AJ&K"],
    },
  ],
  AE: [
    { code: "AZ", name: "Abu Dhabi" },
    { code: "DU", name: "Dubai" },
    { code: "SH", name: "Sharjah" },
    { code: "AJ", name: "Ajman" },
    { code: "UQ", name: "Umm Al Quwain" },
    { code: "RK", name: "Ras Al Khaimah" },
    { code: "FU", name: "Fujairah" },
  ],
  CA: [
    { code: "AB", name: "Alberta" },
    { code: "BC", name: "British Columbia" },
    { code: "MB", name: "Manitoba" },
    { code: "NB", name: "New Brunswick" },
    { code: "NL", name: "Newfoundland and Labrador" },
    { code: "NS", name: "Nova Scotia" },
    { code: "NT", name: "Northwest Territories" },
    { code: "NU", name: "Nunavut" },
    { code: "ON", name: "Ontario" },
    { code: "PE", name: "Prince Edward Island" },
    { code: "QC", name: "Quebec", aliases: ["Québec"] },
    { code: "SK", name: "Saskatchewan" },
    { code: "YT", name: "Yukon" },
  ],
  AU: [
    { code: "ACT", name: "Australian Capital Territory" },
    { code: "NSW", name: "New South Wales" },
    { code: "NT", name: "Northern Territory" },
    { code: "QLD", name: "Queensland" },
    { code: "SA", name: "South Australia" },
    { code: "TAS", name: "Tasmania" },
    { code: "VIC", name: "Victoria" },
    { code: "WA", name: "Western Australia" },
  ],
  US: [
    ["AL", "Alabama"],
    ["AK", "Alaska"],
    ["AZ", "Arizona"],
    ["AR", "Arkansas"],
    ["CA", "California"],
    ["CO", "Colorado"],
    ["CT", "Connecticut"],
    ["DE", "Delaware"],
    ["DC", "District of Columbia"],
    ["FL", "Florida"],
    ["GA", "Georgia"],
    ["HI", "Hawaii"],
    ["ID", "Idaho"],
    ["IL", "Illinois"],
    ["IN", "Indiana"],
    ["IA", "Iowa"],
    ["KS", "Kansas"],
    ["KY", "Kentucky"],
    ["LA", "Louisiana"],
    ["ME", "Maine"],
    ["MD", "Maryland"],
    ["MA", "Massachusetts"],
    ["MI", "Michigan"],
    ["MN", "Minnesota"],
    ["MS", "Mississippi"],
    ["MO", "Missouri"],
    ["MT", "Montana"],
    ["NE", "Nebraska"],
    ["NV", "Nevada"],
    ["NH", "New Hampshire"],
    ["NJ", "New Jersey"],
    ["NM", "New Mexico"],
    ["NY", "New York"],
    ["NC", "North Carolina"],
    ["ND", "North Dakota"],
    ["OH", "Ohio"],
    ["OK", "Oklahoma"],
    ["OR", "Oregon"],
    ["PA", "Pennsylvania"],
    ["PR", "Puerto Rico"],
    ["RI", "Rhode Island"],
    ["SC", "South Carolina"],
    ["SD", "South Dakota"],
    ["TN", "Tennessee"],
    ["TX", "Texas"],
    ["UT", "Utah"],
    ["VT", "Vermont"],
    ["VA", "Virginia"],
    ["WA", "Washington"],
    ["WV", "West Virginia"],
    ["WI", "Wisconsin"],
    ["WY", "Wyoming"],
  ].map(([code, name]) => ({ code: code!, name: name! })),
};

/** Lowercase, no accents, single spaces, "&" as "and", no punctuation. */
export function normalizePlace(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * A comparable key for a region in a country: the ISO code when the name, code
 * or an alias is recognised ("KPK" → "KP"), otherwise the normalised text.
 */
export function regionKey(country: string | null | undefined, region: string | null | undefined) {
  const n = normalizePlace(region);
  if (!n) return "";
  const cc = (country ?? "").toUpperCase();
  const list = REGIONS[cc];
  if (list) {
    const bare = n.replace(new RegExp(`^${cc.toLowerCase()} `), ""); // "PK-PB" → "pb"
    for (const r of list)
      if (
        normalizePlace(r.code) === bare ||
        normalizePlace(r.name) === n ||
        (r.aliases ?? []).some((a) => normalizePlace(a) === n)
      )
        return r.code;
  }
  return n;
}

/** The display name for a region code or name, if known. */
export function regionName(country: string, region: string): string {
  const key = regionKey(country, region);
  return REGIONS[country.toUpperCase()]?.find((r) => r.code === key)?.name ?? region;
}
