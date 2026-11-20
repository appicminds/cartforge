import { DEFAULT_THEME, type ThemeManifest } from "./default-theme";
import { templateSchema, type Template } from "./sections";
import { resolveSettings, type ThemeSettings, type ThemeSettingsOverrides } from "./settings";

export interface ResolvedTheme {
  key: string;
  name: string;
  version: string;
  settings: ThemeSettings;
  templates: { home: Template };
}

/**
 * Theme + merchant overrides → validated, defaulted settings and templates.
 * Next 3 stores overrides and template edits per published theme version; for
 * now the storefront renders the default theme as shipped.
 */
export function resolveTheme(
  manifest: ThemeManifest = DEFAULT_THEME,
  overrides: { settings?: ThemeSettingsOverrides; home?: ThemeManifest["templates"]["home"] } = {},
): ResolvedTheme {
  return {
    key: manifest.key,
    name: manifest.name,
    version: manifest.version,
    settings: resolveSettings(manifest.settings, overrides.settings),
    templates: { home: templateSchema.parse(overrides.home ?? manifest.templates.home) },
  };
}
