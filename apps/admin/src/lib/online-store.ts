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
  TemplateAssignment,
  TemplateTargetKind,
  ArticleView,
  BlogView,
  SavedSectionDetail,
  SavedSectionSummary,
  SampleContentProgress,
} from "@cartforge/types";
import type { ArticleInput, MenuInput, PageInput } from "@cartforge/validation";
import { HEADERS, COOKIES } from "@cartforge/types";
import { API_BASE, apiRequest, newRequestId, normalizeError, readCookie } from "./api-client";
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

// ───────────── Alternate templates ─────────────

export const useTemplateAssignment = (kind: TemplateTargetKind, id: string | undefined) =>
  useGet<TemplateAssignment>(
    ["theme-templates", kind, id],
    id ? `/theme-templates/${kind}/${id}` : null,
  );

export function useAssignTemplate(kind: TemplateTargetKind, id: string) {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (template: string | null) =>
      apiRequest<DetailResponse<TemplateAssignment>>(`/theme-templates/${kind}/${id}`, {
        method: "PUT",
        body: { template },
        storeId,
      }).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(storeKey(storeId, "theme-templates", kind, id), data),
  });
}

// ───────────── Blog ─────────────

export const useBlogs = () => useGet<BlogView[]>(["blogs"], "/blogs");
export const useArticles = (blogId?: string) =>
  useGet<ArticleView[]>(
    ["articles", blogId ?? "all"],
    blogId ? `/articles?blog_id=${blogId}` : "/articles",
  );
export const useArticle = (id: string | undefined) =>
  useGet<ArticleView>(["articles", "one", id], id ? `/articles/${id}` : null);

export function useBlogAction() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      a:
        | { kind: "save"; id?: string; title: string; handle?: string }
        | { kind: "delete"; id: string },
    ): Promise<BlogView | null> => {
      if (a.kind === "delete") {
        await apiRequest(`/blogs/${a.id}`, { method: "DELETE", storeId });
        return null;
      }
      return apiRequest<DetailResponse<BlogView>>(a.id ? `/blogs/${a.id}` : "/blogs", {
        method: a.id ? "PUT" : "POST",
        body: { title: a.title, ...(a.handle ? { handle: a.handle } : {}) },
        storeId,
      }).then((r) => r.data);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "blogs") });
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "articles") });
    },
  });
}

export function useArticleAction() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      a: { kind: "save"; id?: string; body: ArticleInput } | { kind: "delete"; id: string },
    ): Promise<ArticleView | null> => {
      if (a.kind === "delete") {
        await apiRequest(`/articles/${a.id}`, { method: "DELETE", storeId });
        return null;
      }
      return apiRequest<DetailResponse<ArticleView>>(a.id ? `/articles/${a.id}` : "/articles", {
        method: a.id ? "PUT" : "POST",
        body: a.body,
        storeId,
      }).then((r) => r.data);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "articles") });
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "blogs") });
    },
  });
}

// ───────────── Saved sections ─────────────

export const useSavedSections = () =>
  useGet<SavedSectionSummary[]>(["saved-sections"], "/saved-sections");

export function useSavedSectionAction() {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      a:
        | { kind: "save"; name: string; section: unknown }
        | { kind: "get"; id: string }
        | { kind: "delete"; id: string },
    ): Promise<SavedSectionSummary | SavedSectionDetail | null> => {
      if (a.kind === "delete") {
        await apiRequest(`/saved-sections/${a.id}`, { method: "DELETE", storeId });
        return null;
      }
      if (a.kind === "get")
        return apiRequest<DetailResponse<SavedSectionDetail>>(`/saved-sections/${a.id}`, {
          storeId,
        }).then((r) => r.data);
      return apiRequest<DetailResponse<SavedSectionSummary>>("/saved-sections", {
        method: "POST",
        body: { name: a.name, section: a.section },
        storeId,
      }).then((r) => r.data);
    },
    onSettled: (_d, _e, a) => {
      if (a.kind !== "get")
        void qc.invalidateQueries({ queryKey: storeKey(storeId, "saved-sections") });
    },
  });
}

// ───────────── Sample products ─────────────

export const useSampleContent = (themeId: string | undefined, enabled: boolean) =>
  useGet<SampleContentProgress>(
    ["themes", "sample-content", themeId],
    themeId && enabled ? `/themes/${themeId}/sample-content` : null,
  );

/** One step of "Add sample products"; the caller repeats until `done`. */
export function useSampleContentStep(themeId: string) {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<DetailResponse<SampleContentProgress>>(`/themes/${themeId}/sample-content`, {
        method: "POST",
        body: {},
        storeId,
      }).then((r) => r.data),
    onSuccess: (data) =>
      qc.setQueryData(storeKey(storeId, "themes", "sample-content", themeId), data),
  });
}

// ───────────── Theme pictures ─────────────

/**
 * Sends the editor's picture of a theme's home page; the theme library shows it.
 * Refreshes the library afterwards.
 */
export function useUploadThemeThumbnail(themeId: string) {
  const storeId = useStoreId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (image: Blob): Promise<ThemeSummary> => {
      const body = new FormData();
      body.append("file", image, "home.webp");
      const requestId = newRequestId();
      const headers: Record<string, string> = {
        Accept: "application/json",
        [HEADERS.REQUEST_ID]: requestId,
        [HEADERS.STORE_ID]: storeId ?? "",
      };
      const csrf = readCookie(COOKIES.CSRF, document.cookie);
      if (csrf) headers[HEADERS.CSRF] = csrf;
      const res = await fetch(`${API_BASE}/themes/${themeId}/thumbnail`, {
        method: "PUT",
        credentials: "include",
        headers,
        body,
      });
      if (!res.ok) throw await normalizeError(res, requestId);
      return ((await res.json()) as DetailResponse<ThemeSummary>).data;
    },
    // Only the library list: the editor's own copy of the theme stays as it is.
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: storeKey(storeId, "themes"), exact: true }),
  });
}
