import type { FieldError } from "./fields";
import { defaultTheme } from "./presets";
import { SECTIONS, type TemplateKey } from "./sections";
import { newId, validateTheme, type SectionInstance } from "./theme";

/**
 * Saved sections: a page section (not header, footer or a page's main
 * section) stored on its own to reuse. Validated the same way as in a theme.
 */
export function validateSavedSection(raw: unknown): {
  section: SectionInstance | null;
  errors: FieldError[];
} {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const def = typeof r.type === "string" ? SECTIONS[r.type] : undefined;
  if (!def || def.main || !("templates" in def.enabled_on))
    return {
      section: null,
      errors: [{ path: "section.type", message: "This section can't be saved" }],
    };
  const template: TemplateKey =
    def.enabled_on.templates === "*" ? "home" : def.enabled_on.templates[0]!;
  const t = defaultTheme();
  const settings = { ...((r.settings as Record<string, unknown>) ?? {}) };
  // Color schemes differ between themes: keep one of the main three.
  if (!/^scheme-[123]$/.test(String(settings.color_scheme ?? ""))) delete settings.color_scheme;
  t.templates[template] = [{ ...(r as unknown as SectionInstance), id: "saved", settings }];
  const { theme, errors } = validateTheme(JSON.parse(JSON.stringify(t)));
  const prefix = `templates.${template}.`;
  const own = errors.filter((e) => e.path.startsWith(prefix));
  if (own.length)
    return {
      section: null,
      errors: own.map((e) => ({
        path: `section.${e.path.slice(prefix.length).replace(/^\d+\.?/, "")}`.replace(/\.$/, ""),
        message: e.message,
      })),
    };
  const section = theme.templates[template].find((s) => s.id === "saved") ?? null;
  return { section, errors: [] };
}

/** A copy of a saved section with fresh ids, ready to add to a page. */
export function instantiateSection(s: SectionInstance): SectionInstance {
  const copy = JSON.parse(JSON.stringify(s)) as SectionInstance;
  copy.id = newId(`${copy.type.replace(/_/g, "-").slice(0, 12)}-`);
  for (const b of copy.blocks) b.id = newId(`${b.type.replace(/_/g, "-").slice(0, 10)}-`);
  return copy;
}
