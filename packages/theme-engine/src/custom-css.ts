/**
 * Custom CSS (per section and theme-wide). Merchants write ordinary rules; we
 * refuse anything that could load or run something (url(), @import, legacy
 * expression/behavior bindings, escapes that could hide them) or break out of
 * the <style> tag, and scope every rule to its section.
 */

export const MAX_CSS = 5000;

const FORBIDDEN: [RegExp, string][] = [
  [/<|>(?=\s*\/)/, "“<” isn't allowed"],
  [
    /@import|@charset|@namespace|@font-face/i,
    "@import, @charset, @namespace and @font-face aren't allowed",
  ],
  [/url\s*\(|image-set\s*\(|src\s*\(/i, "Images and fonts from links (url(…)) aren't allowed"],
  [/expression\s*\(|javascript:|behavior\s*:|-moz-binding/i, "That isn't allowed in CSS"],
  [/\\/, "Backslash escapes aren't allowed"],
];

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

interface Block {
  prelude: string;
  body: string;
}

/** Top-level `prelude { body }` blocks, or an error. */
function blocks(css: string): Block[] | string {
  const out: Block[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) {
      if (css.slice(i).trim()) return "Every rule needs { … }";
      break;
    }
    const prelude = css.slice(i, open).trim();
    if (!prelude) return "A rule is missing its selector";
    let depth = 1;
    let j = open + 1;
    for (; j < css.length && depth; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
    }
    if (depth) return "A “{” isn't closed";
    out.push({ prelude, body: css.slice(open + 1, j - 1) });
    i = j;
  }
  return out;
}

const NESTING = /^@(media|supports|container)\b/i;

function checkBlocks(css: string, depth: number): string | null {
  const list = blocks(css);
  if (typeof list === "string") return list;
  for (const b of list) {
    if (b.prelude.startsWith("@")) {
      if (/^@keyframes\b/i.test(b.prelude)) continue;
      if (!NESTING.test(b.prelude)) return `${b.prelude.split(/\s/)[0]} isn't supported`;
      if (depth > 1) return "Too many nested @-rules";
      const inner = checkBlocks(b.body, depth + 1);
      if (inner) return inner;
    } else if (b.body.includes("{"))
      return "Nested rules aren't supported; write each rule on its own";
  }
  return null;
}

/** Why this CSS can't be used, or null when it's fine. */
export function checkCss(css: string): string | null {
  if (css.length > MAX_CSS) return `At most ${MAX_CSS} characters`;
  const clean = stripComments(css);
  if (/\/\*/.test(clean)) return "A comment isn't closed";
  for (const [re, msg] of FORBIDDEN) if (re.test(clean)) return msg;
  return checkBlocks(clean, 1);
}

/** Splits a selector list on top-level commas. */
function splitSelectors(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function scopeBlocks(css: string, scope: string | null): string {
  const list = blocks(css);
  if (typeof list === "string") return "";
  return list
    .map((b) => {
      if (/^@keyframes\b/i.test(b.prelude)) return `${b.prelude}{${b.body}}`;
      if (NESTING.test(b.prelude)) return `${b.prelude}{${scopeBlocks(b.body, scope)}}`;
      const sel = scope
        ? splitSelectors(b.prelude)
            .map((x) => (x.includes(":scope") ? x.replace(/:scope/g, scope) : `${scope} ${x}`))
            .join(",")
        : b.prelude;
      return `${sel}{${b.body.trim()}}`;
    })
    .join("");
}

/**
 * Safe, scoped CSS: every selector is prefixed with `scope` (`:scope` stands
 * for the section itself). Returns "" for CSS that doesn't pass `checkCss`.
 */
export function scopeCss(css: string, scope: string | null): string {
  if (!css.trim() || checkCss(css)) return "";
  return scopeBlocks(stripComments(css), scope);
}
