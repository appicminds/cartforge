import { scopeCodeCss, type SectionInstance } from "@cartforge/theme-engine";
import { needsScripts, sanitizeCode } from "@/lib/sanitize-code";
import { CodeFrame } from "./code-frame";
import { Shell, str, type SectionCtx } from "./shared";

/** Reports the document's height to the page (the frame resizes to fit). */
const RESIZE = `<script>(function(){function s(){parent.postMessage({cfCodeHeight:document.documentElement.scrollHeight},"*")}new ResizeObserver(s).observe(document.documentElement);addEventListener("load",s);s()})()</script>`;

/**
 * "Custom code": the merchant's own HTML and CSS. Plain HTML is cleaned and
 * shown on the page with its CSS scoped to the section; code with scripts runs
 * in an isolated frame that gets the theme's colors and fonts.
 */
export function CustomCode({ section, ctx }: { section: SectionInstance; ctx: SectionCtx }) {
  const code = str(section.settings, "code");
  const cssRaw = str(section.settings, "css");
  if (!code.trim()) return null;
  if (!needsScripts(code)) {
    const css = scopeCodeCss(cssRaw, `[data-cf-section="${section.id}"]`);
    return (
      <Shell section={section}>
        {/* Checked by @cartforge/theme-engine (checkCodeCss) and scoped to this section. */}
        {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
        {/* Cleaned against an allow-list (lib/sanitize-code). */}
        <div dangerouslySetInnerHTML={{ __html: sanitizeCode(code) }} />
      </Shell>
    );
  }
  const css = scopeCodeCss(cssRaw, null);
  const fonts = ctx.theme.fontsUrl ? `<link rel="stylesheet" href="${ctx.theme.fontsUrl}">` : "";
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_top">${fonts}<style>${ctx.theme.css}html,body{margin:0;background:transparent;color:var(--sf-text);font-family:var(--sf-font-body);font-size:var(--sf-base-size)}h1,h2,h3,h4{font-family:var(--sf-font-heading);font-weight:var(--sf-heading-weight)}</style><style>${css}</style></head><body>${code}${RESIZE}</body></html>`;
  return (
    <Shell section={section}>
      <CodeFrame srcDoc={doc} title="Custom code" />
    </Shell>
  );
}
