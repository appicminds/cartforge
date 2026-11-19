import sanitize from "sanitize-html";

/**
 * Rich-text sanitizer for merchant-authored HTML (PRD §8.4 A, §23 XSS).
 * Allow-list only: formatting, headings, lists, links. Images/media are added
 * once the media library exists (Sprint 2) and must reference managed assets.
 */
/** Absolute http(s)/mailto/tel, site-relative "/path" (not "//host"), or "#anchor". */
const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

const OPTIONS: sanitize.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "a",
    "ul",
    "ol",
    "li",
    "h2",
    "h3",
    "h4",
    "blockquote",
    "code",
    "pre",
    "hr",
  ],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    // Normalize semantic aliases and harden links.
    b: "strong",
    i: "em",
    a: (tagName, attribs) => {
      const href = (attribs.href ?? "").trim();
      // Unsafe or missing href: unwrap the link (keep its text) by renaming to a
      // disallowed tag, which "discard" mode removes while keeping children.
      if (!SAFE_HREF.test(href)) return { tagName: "cf-unwrap", attribs: {} };
      const out: Record<string, string> = { href };
      if (attribs.target === "_blank") {
        out.target = "_blank";
        out.rel = "noopener noreferrer";
      }
      return { tagName, attribs: out };
    },
  },
};

export function sanitizeRichText(html: string): string {
  const clean = sanitize(html, OPTIONS).trim();
  // Treat editor "empty" output as empty.
  return clean === "<p></p>" || clean === "<p><br /></p>" ? "" : clean;
}
