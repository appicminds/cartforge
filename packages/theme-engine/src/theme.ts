import { SCHEME_ID, defaults, parseSettings, type FieldError } from "./fields";
import { withBrandSchemes } from "./colors";
import { FONT_KEYS } from "./fonts";
import {
  MAIN_SECTION,
  SECTIONS,
  TEMPLATE_KEYS,
  type GroupKey,
  type SectionDef,
  type TemplateKey,
} from "./sections";
import { GLOBAL_FIELDS, MAX_SCHEMES, SCHEME_FIELDS, type ColorScheme } from "./settings";

/**
 * A theme's content: global settings, color schemes, the header and footer
 * section groups and one section list per template. This JSON is what the
 * editor changes, the API stores (draft and published versions) and the
 * storefront renders.
 */
export interface BlockInstance {
  id: string;
  type: string;
  settings: Record<string, unknown>;
  disabled?: boolean;
}

export interface SectionInstance {
  id: string;
  type: string;
  settings: Record<string, unknown>;
  disabled?: boolean;
  blocks: BlockInstance[];
}

export interface ThemeData {
  schema: 2;
  settings: Record<string, unknown>;
  color_schemes: ColorScheme[];
  groups: Record<GroupKey, SectionInstance[]>;
  templates: Record<TemplateKey, SectionInstance[]>;
}

const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const MAX_SECTIONS = 40;
const MAX_BLOCKS = 50;

/** A new random id for sections and blocks ("s1k3j9x2"). */
export function newId(prefix = ""): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

/** A new section of this type with its preset content. */
export function newSection(type: string): SectionInstance {
  const def = SECTIONS[type];
  if (!def) throw new Error(`Unknown section ${type}`);
  return {
    id: newId(`${type.replace(/_/g, "-").slice(0, 12)}-`),
    type,
    settings: { ...defaults(def.settings), ...(def.preset?.settings ?? {}) },
    blocks: (def.preset?.blocks ?? []).map((b) => newBlock(def, b.type, b.settings)),
  };
}

export function newBlock(
  def: SectionDef,
  type: string,
  settings: Record<string, unknown> = {},
): BlockInstance {
  const b = def.blocks?.find((x) => x.type === type);
  if (!b) throw new Error(`Unknown block ${type} in ${def.type}`);
  return {
    id: newId(`${type.replace(/_/g, "-").slice(0, 10)}-`),
    type,
    settings: { ...defaults(b.settings), ...settings },
  };
}

function schemesOf(raw: unknown, errors: FieldError[] | null): ColorScheme[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: ColorScheme[] = [];
  const seen = new Set<string>();
  list.slice(0, MAX_SCHEMES).forEach((s, i) => {
    const r = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const path = `color_schemes.${i}`;
    if (typeof r.id !== "string" || !SCHEME_ID.test(r.id) || seen.has(r.id)) {
      errors?.push({ path: `${path}.id`, message: "Invalid color scheme" });
      return;
    }
    const scheme = {
      id: r.id,
      name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 40) : r.id,
    } as ColorScheme;
    for (const f of SCHEME_FIELDS) {
      const v = r[f.id];
      if (typeof v === "string" && HEX.test(v)) scheme[f.id] = v.toLowerCase();
      else {
        errors?.push({ path: `${path}.${f.id}`, message: "Use a 6-digit hex color like #1a1a1a" });
        scheme[f.id] = f.id.includes("text") || f.id === "text" ? "#111111" : "#ffffff";
      }
    }
    seen.add(r.id);
    out.push(scheme);
  });
  if (list.length > MAX_SCHEMES)
    errors?.push({ path: "color_schemes", message: `At most ${MAX_SCHEMES}` });
  if (!out.length) {
    errors?.push({ path: "color_schemes", message: "Keep at least one color scheme" });
    out.push({
      id: "scheme-1",
      name: "Light",
      background: "#ffffff",
      surface: "#f6f5f2",
      text: "#1c1b19",
      muted: "#5f5c57",
      accent: "#1f3a33",
      accent_text: "#ffffff",
      border: "#e3e0da",
    });
  }
  return out;
}

function sectionsOf(
  raw: unknown,
  where: { group: GroupKey } | { template: TemplateKey },
  ctx: { fonts: Set<string>; schemes: Set<string>; firstScheme: string },
  path: string,
  errors: FieldError[] | null,
): SectionInstance[] {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > MAX_SECTIONS)
    errors?.push({ path, message: `At most ${MAX_SECTIONS} sections` });
  const out: SectionInstance[] = [];
  const ids = new Set<string>();
  const counts = new Map<string, number>();
  list.slice(0, MAX_SECTIONS).forEach((s, i) => {
    const r = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const p = `${path}.${i}`;
    const def = typeof r.type === "string" ? SECTIONS[r.type] : undefined;
    const allowed =
      def &&
      ("group" in where
        ? "group" in def.enabled_on && def.enabled_on.group === where.group
        : "templates" in def.enabled_on &&
          (def.enabled_on.templates === "*" || def.enabled_on.templates.includes(where.template)));
    if (!def || !allowed) {
      errors?.push({ path: `${p}.type`, message: `This section can't be used here` });
      return;
    }
    if (typeof r.id !== "string" || !ID.test(r.id) || ids.has(r.id)) {
      errors?.push({ path: `${p}.id`, message: "Invalid section id" });
      return;
    }
    const n = (counts.get(def.type) ?? 0) + 1;
    if ((def.limit && n > def.limit) || (def.main && n > 1)) {
      errors?.push({ path: p, message: `Only ${def.limit ?? 1} ${def.name} allowed` });
      return;
    }
    counts.set(def.type, n);
    ids.add(r.id);
    const settings = parseSettings(def.settings, r.settings, ctx, `${p}.settings`, errors);
    if ("color_scheme" in settings && !ctx.schemes.has(settings.color_scheme as string))
      settings.color_scheme = ctx.firstScheme;
    const blocks: BlockInstance[] = [];
    const rawBlocks = Array.isArray(r.blocks) ? r.blocks : [];
    const max = def.max_blocks ?? MAX_BLOCKS;
    if (rawBlocks.length > max)
      errors?.push({ path: `${p}.blocks`, message: `At most ${max} blocks` });
    const blockIds = new Set<string>();
    const blockCounts = new Map<string, number>();
    rawBlocks.slice(0, max).forEach((b, j) => {
      const br = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
      const bp = `${p}.blocks.${j}`;
      const bdef = def.blocks?.find((x) => x.type === br.type);
      if (!bdef) {
        errors?.push({ path: `${bp}.type`, message: "Unknown block" });
        return;
      }
      if (typeof br.id !== "string" || !ID.test(br.id) || blockIds.has(br.id)) {
        errors?.push({ path: `${bp}.id`, message: "Invalid block id" });
        return;
      }
      const bn = (blockCounts.get(bdef.type) ?? 0) + 1;
      if (bdef.limit && bn > bdef.limit) {
        errors?.push({ path: bp, message: `Only ${bdef.limit} ${bdef.name} allowed` });
        return;
      }
      blockCounts.set(bdef.type, bn);
      blockIds.add(br.id);
      blocks.push({
        id: br.id,
        type: bdef.type,
        settings: parseSettings(bdef.settings, br.settings, ctx, `${bp}.settings`, errors),
        ...(br.disabled === true ? { disabled: true } : {}),
      });
    });
    out.push({
      id: r.id,
      type: def.type,
      settings,
      ...(r.disabled === true && !def.main ? { disabled: true } : {}),
      blocks,
    });
  });
  // Every template keeps its main section.
  if ("template" in where) {
    const main = MAIN_SECTION[where.template];
    if (main && !out.some((s) => s.type === main)) {
      if (errors && list.length)
        errors.push({ path, message: "The page's main section can't be removed" });
      const s = newSection(main);
      s.id = "main";
      while (out.some((x) => x.id === s.id)) s.id = newId("main-");
      out.unshift(s);
    }
  }
  return out;
}

/**
 * Validates and normalizes theme content. With `strict`, problems are returned
 * as field errors (the API refuses the save); without it, bad values fall back
 * to defaults (the storefront always gets something it can render).
 */
export function validateTheme(
  raw: unknown,
  strict = true,
): { theme: ThemeData; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const e = strict ? errors : null;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawSettings = (r.settings && typeof r.settings === "object" ? r.settings : {}) as Record<
    string,
    unknown
  >;
  // Brand colors: the three main schemes follow the primary color (unless turned off).
  let color_schemes = schemesOf(r.color_schemes, e);
  if (
    rawSettings.auto_schemes !== false &&
    typeof rawSettings.primary_color === "string" &&
    HEX.test(rawSettings.primary_color)
  )
    color_schemes = withBrandSchemes(color_schemes, rawSettings.primary_color.toLowerCase());
  const ctx = {
    fonts: FONT_KEYS,
    schemes: new Set(color_schemes.map((s) => s.id)),
    firstScheme: color_schemes[0]!.id,
  };
  const settings = parseSettings(GLOBAL_FIELDS, r.settings, ctx, "settings", e);
  // Themes saved before brand colors keep their own schemes.
  if (typeof rawSettings.primary_color !== "string") {
    settings.primary_color = color_schemes[0]!.accent;
    if (rawSettings.auto_schemes === undefined) settings.auto_schemes = false;
  }
  const groups = (r.groups && typeof r.groups === "object" ? r.groups : {}) as Record<
    string,
    unknown
  >;
  const templates = (r.templates && typeof r.templates === "object" ? r.templates : {}) as Record<
    string,
    unknown
  >;
  const theme: ThemeData = {
    schema: 2,
    settings,
    color_schemes,
    groups: {
      header: sectionsOf(groups.header, { group: "header" }, ctx, "groups.header", e),
      footer: sectionsOf(groups.footer, { group: "footer" }, ctx, "groups.footer", e),
    },
    templates: Object.fromEntries(
      TEMPLATE_KEYS.map((k) => [
        k,
        sectionsOf(templates[k], { template: k }, ctx, `templates.${k}`, e),
      ]),
    ) as Record<TemplateKey, SectionInstance[]>,
  };
  return { theme, errors };
}

/** Everything a theme references that the API resolves when serving it. */
export function themeReferences(t: ThemeData): {
  media: string[];
  menus: string[];
} {
  const media = new Set<string>();
  const menus = new Set<string>();
  const visit = (
    fields: readonly { id?: string; type: string }[],
    values: Record<string, unknown>,
  ) => {
    for (const f of fields) {
      if (!f.id) continue;
      const v = values[f.id];
      if (f.type === "image" && typeof v === "string") media.add(v);
      if (f.type === "menu" && typeof v === "string" && v) menus.add(v);
    }
  };
  visit(GLOBAL_FIELDS, t.settings);
  const all = [...t.groups.header, ...t.groups.footer, ...Object.values(t.templates).flat()];
  for (const s of all) {
    const def = SECTIONS[s.type];
    if (!def) continue;
    visit(def.settings, s.settings);
    for (const b of s.blocks) {
      const bdef = def.blocks?.find((x) => x.type === b.type);
      if (bdef) visit(bdef.settings, b.settings);
    }
  }
  return { media: [...media], menus: [...menus] };
}

/** Rich-text values, so the API can sanitize them before saving. */
export function mapRichText(t: ThemeData, fn: (html: string) => string): ThemeData {
  const all = [...t.groups.header, ...t.groups.footer, ...Object.values(t.templates).flat()];
  for (const s of all) {
    const def = SECTIONS[s.type];
    if (!def) continue;
    for (const f of def.settings)
      if (f.type === "richtext" && typeof s.settings[f.id] === "string")
        s.settings[f.id] = fn(s.settings[f.id] as string);
    for (const b of s.blocks) {
      const bdef = def.blocks?.find((x) => x.type === b.type);
      for (const f of bdef?.settings ?? [])
        if (f.type === "richtext" && typeof b.settings[f.id] === "string")
          b.settings[f.id] = fn(b.settings[f.id] as string);
    }
  }
  return t;
}
