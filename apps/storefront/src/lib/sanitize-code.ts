import "server-only";
import { checkCss } from "@cartforge/theme-engine";
import sanitize from "sanitize-html";

/**
 * The "Custom code" section's HTML, cleaned for showing directly on the page:
 * layout and text markup, images, links and known video/map embeds stay;
 * scripts, event handlers, forms and unknown frames go. Inline styles are kept
 * only when they pass the Custom CSS check.
 */
const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;
const SAFE_SRC = /^(?:https:\/\/|\/(?!\/))/i;

const OPTIONS: sanitize.IOptions = {
  allowedTags: [
    "div",
    "span",
    "section",
    "article",
    "aside",
    "header",
    "footer",
    "nav",
    "main",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
    "hr",
    "blockquote",
    "pre",
    "code",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "small",
    "mark",
    "sup",
    "sub",
    "ul",
    "ol",
    "li",
    "dl",
    "dt",
    "dd",
    "a",
    "img",
    "picture",
    "source",
    "figure",
    "figcaption",
    "video",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "caption",
    "colgroup",
    "col",
    "details",
    "summary",
    "iframe",
    "svg",
    "path",
    "circle",
    "rect",
    "line",
    "polyline",
    "polygon",
    "g",
  ],
  allowedAttributes: {
    "*": ["class", "id", "style", "title", "role", "aria-*", "data-*", "lang", "dir"],
    a: ["href", "target", "rel"],
    img: ["src", "srcset", "sizes", "alt", "width", "height", "loading"],
    source: ["src", "srcset", "media", "type", "sizes"],
    video: [
      "src",
      "poster",
      "controls",
      "autoplay",
      "muted",
      "loop",
      "playsinline",
      "width",
      "height",
    ],
    iframe: ["src", "width", "height", "allow", "allowfullscreen", "loading", "title"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
    svg: ["viewbox", "width", "height", "fill", "stroke", "stroke-width", "xmlns"],
    path: ["d", "fill", "stroke", "stroke-width"],
    circle: ["cx", "cy", "r", "fill", "stroke"],
    rect: ["x", "y", "width", "height", "rx", "fill", "stroke"],
    line: ["x1", "y1", "x2", "y2", "stroke"],
    polyline: ["points", "fill", "stroke"],
    polygon: ["points", "fill", "stroke"],
    g: ["fill", "stroke"],
    details: ["open"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["https"], source: ["https"], video: ["https"], iframe: ["https"] },
  allowProtocolRelative: false,
  allowedIframeHostnames: [
    "www.youtube-nocookie.com",
    "www.youtube.com",
    "player.vimeo.com",
    "www.google.com",
    "maps.google.com",
    "www.instagram.com",
    "www.tiktok.com",
    "www.facebook.com",
    "docs.google.com",
    "open.spotify.com",
    "w.soundcloud.com",
  ],
  disallowedTagsMode: "discard",
  // Frames whose address was removed (not a known video/map provider) go entirely.
  exclusiveFilter: (frame) => frame.tag === "iframe" && !frame.attribs.src,
  transformTags: {
    "*": (tagName, attribs) => {
      const out = { ...attribs };
      // Inline styles: only what Custom CSS allows (no url(), expressions…).
      if (out.style !== undefined && checkCss(`x{${out.style}}`)) delete out.style;
      if (tagName === "a") {
        if (!SAFE_HREF.test((out.href ?? "").trim())) delete out.href;
        if (out.target === "_blank") out.rel = "noopener noreferrer";
      }
      if ((tagName === "img" || tagName === "source") && out.src && !SAFE_SRC.test(out.src))
        delete out.src;
      return { tagName, attribs: out };
    },
  },
};

export const sanitizeCode = (html: string) => sanitize(html, OPTIONS);

/** Code that needs scripts (shown in an isolated frame instead). */
export const needsScripts = (html: string) =>
  /<script\b|\son[a-z]+\s*=|javascript:|<form\b|<input\b|<button\b|<select\b|<textarea\b/i.test(
    html,
  );
