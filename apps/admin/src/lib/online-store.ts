"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DetailResponse,
  MenuView,
  PageView,
  ThemeDetail,
  ThemePresetSummary,
  ThemePreviewLink,
  ThemeSaveResult,
  ThemeSummary,
  ThemeVersionSummary,
} from "@cartforge/types";
import type { MenuInput, PageInput } from "@cartforge/validation";
import { apiRequest } from "./api-client";
import { storeKey, useSession } from "./session";

const useStoreId = () => useSession().store?.store_id;

function useGet<T>(key: unknown[], path: string | null) {
  const storeId = useStoreId();
  return useQuery({
    queryKey: storeKey(storeId, ...key),
    enabled: Boolean(storeId && path),
    queryFn: ({ signal }) =>
      apiRequest<DetailResponse<T>>(path!, { storeId, signal }).then((r) => r.data),
  });
}

// ───────────── Themes ─────────────

export const useThemes = () => useGet<ThemeSummary[]>(["themes"], "/themes");
export const useThemePresets = () =>
  useGet<ThemePresetSummary[]>(["themes", "presets"], "/themes/presets");
export const useTheme = (id: string | undefined) =>
  useGet<ThemeDetail>(["themes", "detail", id], id ? `/themes/${id}` : null);
export const useThemeVersions = (id: string | undefined, enabled = true) =>
  useGet<ThemeVersionSummary[]>(
    ["themes", "versions", id],
    id && enabled ? `/themes/${id}/versions` : null,
  );

type ThemeAction =
  | { kind: "create"; preset: string; name?: string }
  | { kind: "duplicate"; id: string }
  | { kind: "rename"; id: string; name: string }
  | { kind: "delete"; id: string }
  | { kind: "publish"; id: string }
  | { kind: "discard"; id: string }
  | { kind: "restore"; id: string; version: string };

export function useThemeAction() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: ThemeAction): Promise<ThemeSummary | null> => {
      const post = (path: string, body: unknown = {}) =>
        apiRequest<DetailResponse<ThemeSummary>>(path, { method: "POST", body, storeId }).then(
          (r) => r.data,
        );
      switch (a.kind) {
        case "create":
          return post("/themes", { preset: a.preset, ...(a.name ? { name: a.name } : {}) });
        case "duplicate":
          return post(`/themes/${a.id}/duplicate`);
        case "rename":
          return apiRequest<DetailResponse<ThemeSummary>>(`/themes/${a.id}`, {
            method: "PATCH",
            body: { name: a.name },
            storeId,
          }).then((r) => r.data);
        case "delete":
          await apiRequest(`/themes/${a.id}`, { method: "DELETE", storeId });
          return null;
        case "publish":
          return post(`/themes/${a.id}/publish`);
        case "discard":
          return post(`/themes/${a.id}/discard`);
        case "restore":
          return post(`/themes/${a.id}/versions/${a.version}/restore`);
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: storeKey(storeId, "themes") }),
  });
}

export function useSaveTheme(id: string) {
  const storeId = useStoreId();
  return useMutation({
    mutationFn: (data: unknown) =>
      apiRequest<DetailResponse<ThemeSaveResult>>(`/themes/${id}/data`, {
        method: "PUT",
        body: { data },
        storeId,
      }).then((r) => r.data),
  });
}

export function useThemePreviewLink() {
  const storeId = useStoreId();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<DetailResponse<ThemePreviewLink>>(`/themes/${id}/preview-link`, {
        method: "POST",
        body: {},
        storeId,
      }).then((r) => r.data),
  });
}

/** The address the storefront answers on for this store (own domain or shared preview). */
export function useStorefrontBase(): string | null {
  const { store } = useSession();
  return store?.store_url ?? store?.store_preview_url ?? null;
}

/** `base` + path + extra query, keeping a `?store=<handle>` preview parameter. */
export function storefrontUrl(base: string, path: string, query: Record<string, string> = {}) {
  const b = new URL(
    base,
    typeof window === "undefined" ? "http://localhost" : window.location.href,
  );
  const target = new URL(path, b.origin);
  b.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  for (const [k, v] of Object.entries(query)) target.searchParams.set(k, v);
  return target.toString();
}

// ───────────── Menus ─────────────

export const useMenus = () => useGet<MenuView[]>(["menus"], "/menus");
export const useMenu = (id: string | undefined) =>
  useGet<MenuView>(["menus", id], id ? `/menus/${id}` : null);

export function useMenuAction() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      a: { kind: "save"; id?: string; body: MenuInput } | { kind: "delete"; id: string },
    ): Promise<MenuView | null> => {
      if (a.kind === "delete") {
        await apiRequest(`/menus/${a.id}`, { method: "DELETE", storeId });
        return null;
      }
      return apiRequest<DetailResponse<MenuView>>(a.id ? `/menus/${a.id}` : "/menus", {
        method: a.id ? "PUT" : "POST",
        body: a.body,
        storeId,
      }).then((r) => r.data);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: storeKey(storeId, "menus") }),
  });
}

// ───────────── Pages ─────────────

export const usePages = () => useGet<PageView[]>(["pages"], "/pages");
export const usePage = (id: string | undefined) =>
  useGet<PageView>(["pages", id], id ? `/pages/${id}` : null);

export function usePageAction() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      a: { kind: "save"; id?: string; body: PageInput } | { kind: "delete"; id: string },
    ): Promise<PageView | null> => {
      if (a.kind === "delete") {
        await apiRequest(`/pages/${a.id}`, { method: "DELETE", storeId });
        return null;
      }
      return apiRequest<DetailResponse<PageView>>(a.id ? `/pages/${a.id}` : "/pages", {
        method: a.id ? "PUT" : "POST",
        body: a.body,
        storeId,
      }).then((r) => r.data);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: storeKey(storeId, "pages") }),
  });
}
