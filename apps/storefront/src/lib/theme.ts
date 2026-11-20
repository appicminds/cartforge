import "server-only";
import { resolveTheme, themeCss, type ResolvedTheme } from "@cartforge/theme-engine";

let resolved: ResolvedTheme | undefined;

/** Next 3 loads the store's published theme version; for now the default theme. */
export function getTheme(): ResolvedTheme {
  resolved ??= resolveTheme();
  return resolved;
}

export const getThemeCss = () => themeCss(getTheme().settings);
