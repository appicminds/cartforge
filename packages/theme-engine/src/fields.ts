import { checkCss } from "./custom-css";
import { parseEmbed } from "./embed";
import { parseVideo } from "./video";
/**
 * Setting fields: one vocabulary drives validation (here), the editor's forms
 * (admin) and rendering (storefront). Every value is constrained — hex colors,
 * enums, bounded numbers, plain text, site paths or https links, ids of the
 * store's own media — so nothing a merchant enters is ever executed (PRD §11.2).
 */

export type Option = { value: string; label: string };

interface Base {
  id: string;
  label: string;
  info?: string;
}

export type Field =
  | (Base & { type: "text"; default?: string; max?: number; placeholder?: string })
  | (Base & { type: "textarea"; default?: string; max?: number; placeholder?: string })
  /** Limited HTML (p, strong, em, a, lists); the API sanitizes it on save. */
  | (Base & { type: "richtext"; default?: string })
  /** A media library asset id (resolved to URLs when the theme is served). */
  | (Base & { type: "image" })
  | (Base & { type: "select"; options: Option[]; default: string })
  | (Base & { type: "radio"; options: Option[]; default: string })
  | (Base & { type: "checkbox"; default: boolean })
  | (Base & {
      type: "range";
      min: number;
      max: number;
      step?: number;
      unit?: string;
      default: number;
    })
  | (Base & { type: "color"; default: string })
  | (Base & { type: "color_scheme"; default: string })
  | (Base & { type: "font"; default: string })
  /** "/path" on the store, or an https:// link. */
  | (Base & { type: "link"; default?: string; placeholder?: string })
  | (Base & { type: "collection" })
  /** A blog's handle. */
  | (Base & { type: "blog" })
  | (Base & { type: "category" })
  | (Base & { type: "product" })
  | (Base & { type: "products"; max: number })
  | (Base & { type: "collections"; max: number })
  | (Base & { type: "menu"; default: string })
  /** A YouTube or Vimeo address. */
  | (Base & { type: "video" })
  /** A link from a known provider (Maps, Instagram, TikTok…), see embed.ts. */
  | (Base & { type: "embed" })
  /** A date and time (ISO 8601), e.g. a countdown's end. */
  | (Base & { type: "datetime" })
  /** Custom CSS: checked for safety and scoped when rendered (see custom-css.ts). */
  | (Base & { type: "css"; default?: string })
  /** Editor-only headings and notes: no value. */
  | { type: "header"; id?: undefined; label: string; info?: string }
  | { type: "paragraph"; id?: undefined; label: string; info?: string };

export type ValueField = Exclude<Field, { type: "header" | "paragraph" }>;

export const isValueField = (f: Field): f is ValueField =>
  f.type !== "header" && f.type !== "paragraph";

const HEX = /^#[0-9a-f]{6}$/i;
const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A path on this store ("/products?sort=newest"), never "//host". */
const SITE_PATH = /^\/(?!\/)[^\s<>"']*$/;
const HTTPS = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[/?#][^\s<>"']*)?$/i;
/** Scheme ids are used in CSS class names. */
export const SCHEME_ID = /^scheme-[a-z0-9]{1,12}$/;

export { parseVideo } from "./video";

export const isSafeLink = (v: string) => v === "" || SITE_PATH.test(v) || HTTPS.test(v);

// eslint-disable-next-line no-control-regex -- strips control characters on purpose
const plain = (v: string) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

type Result = { ok: true; value: unknown } | { ok: false; message: string };

/** The value a field takes when nothing (or nothing valid) is set. */
export function defaultValue(f: ValueField): unknown {
  switch (f.type) {
    case "text":
    case "textarea":
    case "richtext":
    case "link":
    case "css":
      return f.default ?? "";
    case "select":
    case "radio":
    case "color":
    case "color_scheme":
    case "font":
    case "menu":
      return f.default;
    case "checkbox":
    case "range":
      return f.default;
    case "products":
    case "collections":
      return [];
    default:
      return null;
  }
}

/** Checks one value. `ctx` supplies what's valid right now (fonts, schemes). */
export function checkField(
  f: ValueField,
  raw: unknown,
  ctx: { fonts: Set<string>; schemes: Set<string> },
): Result {
  const bad = (message: string): Result => ({ ok: false, message });
  if (raw === undefined) return { ok: true, value: defaultValue(f) };
  switch (f.type) {
    case "text":
    case "textarea": {
      if (typeof raw !== "string") return bad("Must be text");
      const max = f.max ?? (f.type === "text" ? 200 : 2000);
      if (raw.length > max) return bad(`At most ${max} characters`);
      return { ok: true, value: plain(raw) };
    }
    case "richtext":
      if (typeof raw !== "string") return bad("Must be text");
      if (raw.length > 10_000) return bad("At most 10,000 characters");
      return { ok: true, value: raw };
    case "image":
      if (raw === null || raw === "") return { ok: true, value: null };
      return typeof raw === "string" && UUID.test(raw)
        ? { ok: true, value: raw.toLowerCase() }
        : bad("Choose an image from the library");
    case "select":
    case "radio":
      return typeof raw === "string" && f.options.some((o) => o.value === raw)
        ? { ok: true, value: raw }
        : bad("Choose one of the options");
    case "checkbox":
      return typeof raw === "boolean" ? { ok: true, value: raw } : bad("Must be on or off");
    case "range": {
      const step = f.step ?? 1;
      if (typeof raw !== "number" || !Number.isFinite(raw)) return bad("Must be a number");
      if (raw < f.min || raw > f.max) return bad(`Between ${f.min} and ${f.max}`);
      return { ok: true, value: Math.round(raw / step) * step };
    }
    case "color":
      return typeof raw === "string" && HEX.test(raw)
        ? { ok: true, value: raw.toLowerCase() }
        : bad("Use a 6-digit hex color like #1a1a1a");
    case "color_scheme":
      return typeof raw === "string" && ctx.schemes.has(raw)
        ? { ok: true, value: raw }
        : bad("Choose a color scheme");
    case "font":
      return typeof raw === "string" && ctx.fonts.has(raw)
        ? { ok: true, value: raw }
        : bad("Choose a font");
    case "link":
      if (typeof raw !== "string") return bad("Must be a link");
      return isSafeLink(raw.trim())
        ? { ok: true, value: raw.trim() }
        : bad("Use a path on this store like /products, or a link starting with https://");
    case "collection":
    case "category":
    case "product":
    case "blog":
      if (raw === null || raw === "") return { ok: true, value: null };
      return typeof raw === "string" && HANDLE.test(raw) && raw.length <= 255
        ? { ok: true, value: raw }
        : bad("Choose one from the list");
    case "products":
    case "collections":
      if (!Array.isArray(raw)) return bad("Must be a list");
      if (raw.length > f.max) return bad(`At most ${f.max}`);
      if (!raw.every((h) => typeof h === "string" && HANDLE.test(h)))
        return bad("Choose from the list");
      return { ok: true, value: [...new Set(raw as string[])] };
    case "menu":
      return typeof raw === "string" && (raw === "" || HANDLE.test(raw))
        ? { ok: true, value: raw }
        : bad("Choose a menu");
    case "embed":
      if (raw === null || raw === "") return { ok: true, value: null };
      return typeof raw === "string" && parseEmbed(raw)
        ? { ok: true, value: raw.trim() }
        : bad(
            "Use a link from YouTube, Vimeo, Google Maps, Instagram, TikTok, Facebook, Google Forms, Typeform, Spotify or SoundCloud",
          );
    case "datetime":
      if (raw === null || raw === "") return { ok: true, value: null };
      return typeof raw === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) &&
        !Number.isNaN(Date.parse(raw))
        ? { ok: true, value: new Date(raw).toISOString() }
        : bad("Choose a date and time");
    case "css": {
      if (typeof raw !== "string") return bad("Must be text");
      const problem = checkCss(raw);
      return problem ? bad(problem) : { ok: true, value: raw };
    }
    case "video":
      if (raw === null || raw === "") return { ok: true, value: null };
      return typeof raw === "string" && parseVideo(raw)
        ? { ok: true, value: raw.trim() }
        : bad("Use a YouTube or Vimeo link");
  }
}

export interface FieldError {
  path: string;
  message: string;
}

/**
 * Validates a settings object against its fields. Strict mode reports every
 * problem; lenient mode (used when rendering) quietly falls back to defaults.
 * Unknown keys are dropped either way.
 */
export function parseSettings(
  fields: readonly Field[],
  raw: unknown,
  ctx: { fonts: Set<string>; schemes: Set<string> },
  path: string,
  errors: FieldError[] | null,
): Record<string, unknown> {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (!isValueField(f)) continue;
    const r = checkField(f, obj[f.id], ctx);
    if (r.ok) out[f.id] = r.value;
    else {
      errors?.push({ path: `${path}.${f.id}`, message: r.message });
      out[f.id] = defaultValue(f);
    }
  }
  return out;
}

/** Defaults for a list of fields (new sections and blocks). */
export function defaults(fields: readonly Field[]): Record<string, unknown> {
  return Object.fromEntries(fields.filter(isValueField).map((f) => [f.id, defaultValue(f)]));
}
