"use client";

import { SECTIONS } from "@cartforge/theme-engine";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type FromEditor =
  | { source: "cf-editor"; type: "refresh" }
  | { source: "cf-editor"; type: "select"; section: string | null; block?: string | null }
  | { source: "cf-editor"; type: "inspect"; on: boolean }
  | { source: "cf-editor"; type: "capture"; id: string };

const isEditorMsg = (d: unknown): d is FromEditor =>
  !!d && typeof d === "object" && (d as { source?: unknown }).source === "cf-editor";

/** Thumbnail size: 16:10 at 800 px wide (the theme library's picture). */
const THUMB_WIDTH = 800;
const THUMB_RATIO = 10 / 16;

/** Reads a file as a data: URL. */
const dataUrl = async (url: string) => {
  const blob = await (await fetch(url)).blob();
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
};

/**
 * The theme's Google Fonts (Latin) as an inline style with the font files
 * embedded: the picture can't read Google's stylesheet itself.
 */
async function inlineFonts(): Promise<HTMLStyleElement | null> {
  const hrefs = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
    .map((l) => l.href)
    .filter((h) => h.startsWith("https://fonts.googleapis.com/"));
  const faces: string[] = [];
  for (const href of hrefs) {
    const css = await (await fetch(href)).text();
    for (const m of css.matchAll(/\/\* latin \*\/\s*(@font-face\s*\{[^}]*\})/g)) {
      const url = m[1]!.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
      if (url) faces.push(m[1]!.replace(url, await dataUrl(url)));
    }
  }
  if (!faces.length) return null;
  const style = document.createElement("style");
  style.textContent = faces.join("\n");
  document.head.appendChild(style);
  return style;
}

/**
 * A picture of the top of the page as shoppers see it (no editor outlines), for
 * the theme library. Desktop widths only. The library is loaded on demand.
 */
async function capturePage(): Promise<Blob | null> {
  const width = document.documentElement.clientWidth;
  if (width < 700) return null;
  const height = Math.round(width * THUMB_RATIO);
  // Pictures near the top must be loaded (lazy ones may not be yet).
  const pending = [...document.images].filter(
    (img) => img.getBoundingClientRect().top + window.scrollY < height && !img.complete,
  );
  for (const img of pending) img.loading = "eager";
  await Promise.race([
    Promise.all([
      document.fonts?.ready,
      ...pending.map((img) => img.decode().catch(() => undefined)),
    ]),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  const fonts = await inlineFonts().catch(() => null);
  const marked = [...document.querySelectorAll(".cf-selected, .cf-hover")];
  const classes = marked.map((el) => el.className);
  marked.forEach((el) => el.classList.remove("cf-selected", "cf-hover"));
  try {
    const { domToBlob } = await import("modern-screenshot");
    return await domToBlob(document.documentElement, {
      width,
      height,
      scale: THUMB_WIDTH / width,
      type: "image/webp",
      quality: 0.8,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      timeout: 3000,
      filter: (node) =>
        !(node instanceof HTMLElement) ||
        !(
          node.classList.contains("cf-editor-label") ||
          node.dataset.testid === "preview-bar" ||
          node.dataset.testid === "theme-preview-bar"
        ),
    });
  } catch {
    return null;
  } finally {
    fonts?.remove();
    marked.forEach((el, i) => (el.className = classes[i]!));
  }
}

/**
 * Talks to the theme editor when the store is shown in its preview frame:
 * reloads after each save, highlights the selected section, reports clicks
 * (inspector) and page changes, and takes the theme library's picture on request. Outside the editor it shows a preview banner.
 */
export function EditorBridge() {
  const router = useRouter();
  const path = usePathname();
  const [framed, setFramed] = useState<boolean | null>(null);
  const inspect = useRef(true);
  const label = useRef<HTMLDivElement | null>(null);

  useEffect(() => setFramed(window.parent !== window), []);

  // Page changes and readiness.
  useEffect(() => {
    if (!framed) return;
    window.parent.postMessage(
      { source: "cf-preview", type: "ready", path: path + window.location.search },
      "*",
    );
  }, [framed, path]);

  useEffect(() => {
    if (!framed) return;
    const tag = document.createElement("div");
    tag.className = "cf-editor-label";
    tag.hidden = true;
    document.body.appendChild(tag);
    label.current = tag;
    const nameOf = (el: Element) =>
      SECTIONS[el.getAttribute("data-cf-type") ?? ""]?.name ?? "Section";
    let hovered: Element | null = null;

    const onMessage = (e: MessageEvent) => {
      if (!isEditorMsg(e.data)) return;
      const m = e.data;
      if (m.type === "refresh") router.refresh();
      if (m.type === "inspect") inspect.current = m.on;
      if (m.type === "capture")
        void capturePage().then((image) =>
          window.parent.postMessage(
            {
              source: "cf-preview",
              type: "capture",
              id: m.id,
              path: window.location.pathname,
              image,
            },
            "*",
          ),
        );
      if (m.type === "select") {
        document.querySelectorAll(".cf-selected").forEach((x) => x.classList.remove("cf-selected"));
        if (!m.section) return;
        const sec = document.querySelector(`[data-cf-section="${CSS.escape(m.section)}"]`);
        const target =
          (m.block && sec?.querySelector(`[data-cf-block="${CSS.escape(m.block)}"]`)) || sec;
        if (target) {
          target.classList.add("cf-selected");
          target.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    };
    const onOver = (e: MouseEvent) => {
      if (!inspect.current) return;
      const sec = (e.target as Element).closest?.("[data-cf-section]");
      if (sec === hovered) return;
      hovered?.classList.remove("cf-hover");
      hovered = sec;
      if (!sec) {
        tag.hidden = true;
        return;
      }
      sec.classList.add("cf-hover");
      const r = sec.getBoundingClientRect();
      tag.textContent = nameOf(sec);
      tag.style.top = `${Math.max(0, r.top + window.scrollY)}px`;
      tag.style.left = `${r.left + window.scrollX}px`;
      tag.hidden = false;
    };
    const onClick = (e: MouseEvent) => {
      if (!inspect.current) return;
      const el = e.target as Element;
      const sec = el.closest?.("[data-cf-section]");
      if (!sec) return;
      // In the editor, clicking selects instead of following links.
      e.preventDefault();
      e.stopPropagation();
      const block = el.closest("[data-cf-block]");
      window.parent.postMessage(
        {
          source: "cf-preview",
          type: "select",
          section: sec.getAttribute("data-cf-section"),
          block: block && sec.contains(block) ? block.getAttribute("data-cf-block") : null,
        },
        "*",
      );
    };
    window.addEventListener("message", onMessage);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("click", onClick, true);
      tag.remove();
    };
  }, [framed, router]);

  if (framed === null) return null;
  if (framed)
    return (
      <style>{`
        [data-cf-section].cf-hover{outline:2px dashed #3b82f6;outline-offset:-2px}
        .cf-selected{outline:2px solid #2563eb !important;outline-offset:-2px}
        .cf-editor-label{position:absolute;z-index:9999;background:#2563eb;color:#fff;font:600 12px/1 system-ui,sans-serif;padding:4px 8px;border-radius:0 0 4px 0;pointer-events:none}
      `}</style>
    );
  return (
    <aside
      aria-label="Theme preview"
      className="bg-ink px-4 py-2 text-center text-sm text-bg"
      data-testid="theme-preview-bar"
    >
      You&apos;re previewing an unpublished theme. Shoppers don&apos;t see these changes yet.{" "}
      <a href="?theme_preview=" className="font-medium underline underline-offset-2">
        Exit preview
      </a>
    </aside>
  );
}
