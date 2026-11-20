import { slugify } from "@cartforge/validation";

/** First free handle: base, base-2, base-3… given the handles already used. */
export function nextFreeHandle(source: string, used: Iterable<string>, fallback: string): string {
  const base = slugify(source, 240) || fallback;
  const taken = new Set(used);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now().toString(36)}`;
}
