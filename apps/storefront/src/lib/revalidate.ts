import { timingSafeEqual } from "node:crypto";

/** Tags the API may purge: the global catalog or one store's ("catalog:<uuid>"). */
const ALLOWED = /^catalog(:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/;

export function secretMatches(given: string | null, expected: string): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function tagsFrom(body: unknown): string[] {
  const tags = (body as { tags?: unknown } | null)?.tags;
  return Array.isArray(tags)
    ? tags.filter((t): t is string => typeof t === "string" && ALLOWED.test(t))
    : [];
}
