import { timingSafeEqual } from "node:crypto";

/** Tags the API may purge. Anything else is ignored. */
export const ALLOWED_TAGS = new Set(["catalog"]);

export function secretMatches(given: string | null, expected: string): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function tagsFrom(body: unknown): string[] {
  const tags = (body as { tags?: unknown } | null)?.tags;
  return Array.isArray(tags) ? tags.filter((t): t is string => ALLOWED_TAGS.has(t as string)) : [];
}
