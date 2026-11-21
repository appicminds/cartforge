import "server-only";
import {
  defaultTheme,
  themeCss,
  themeFontsUrl,
  validateTheme,
  type ColorScheme,
  type SectionInstance,
  type TemplateKey,
  type ThemeData,
} from "@cartforge/theme-engine";
import type { StorefrontMenuItem, ThemeImage } from "@cartforge/types";
import { headers } from "next/headers";
import { cache } from "react";
import { storefront } from "./api";
import { THEME_PREVIEW_HEADER } from "./site-headers";

export interface LoadedTheme {
  id: string | null;
  /** A draft shown in the theme editor or through a preview link. */
  preview: boolean;
  data: ThemeData;
  images: Record<string, ThemeImage>;
  menus: Record<string, StorefrontMenuItem[]>;
  css: string;
  fontsUrl: string | null;
}

/**
 * The store's theme for this request: the live one, or a theme's saved draft
 * when a preview token rides along (set by middleware from `?theme_preview=`).
 * Falls back to the default theme if the API can't be reached.
 */
export const getTheme = cache(async (): Promise<LoadedTheme> => {
  const token = (await headers()).get(THEME_PREVIEW_HEADER);
  let payload: Awaited<ReturnType<typeof storefront.theme>> | null = null;
  try {
    payload = await storefront.theme(token);
  } catch {
    payload = null;
  }
  const ok = payload?.kind === "ok" ? payload.data : null;
  // The API already validated it; this keeps rendering safe whatever arrives.
  const data = ok ? validateTheme(ok.data, false).theme : defaultTheme();
  return {
    id: ok?.theme_id ?? null,
    preview: ok?.preview ?? false,
    data,
    images: ok?.images ?? {},
    menus: ok?.menus ?? {},
    css: themeCss(data),
    fontsUrl: themeFontsUrl(data),
  };
});

export const templateSections = async (key: TemplateKey): Promise<SectionInstance[]> =>
  (await getTheme()).data.templates[key].filter((s) => !s.disabled);

export const firstScheme = async (): Promise<ColorScheme> =>
  (await getTheme()).data.color_schemes[0]!;

/** A theme setting (global), typed by the caller. */
export async function setting<T>(id: string): Promise<T> {
  return (await getTheme()).data.settings[id] as T;
}
