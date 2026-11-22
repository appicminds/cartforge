"use client";

import { SECTIONS } from "@cartforge/theme-engine";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type FromEditor =
  | { source: "cf-editor"; type: "refresh" }
  | { source: "cf-editor"; type: "select"; section: string | null; block?: string | null }
  | { source: "cf-editor"; type: "inspect"; on: boolean };

const isEditorMsg = (d: unknown): d is FromEditor =>
  !!d && typeof d === "object" && (d as { source?: unknown }).source === "cf-editor";

/**
 * Talks to the theme editor when the store is shown in its preview frame:
 * reloads after each save, highlights the selected section, and reports clicks
 * (inspector) and page changes. Outside the editor it shows a preview banner.
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
