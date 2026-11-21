import { describe, expect, it } from "vitest";
import {
  PRESETS,
  SECTION_DEFS,
  TEMPLATE_KEYS,
  canAddTo,
  contrastProblems,
  contrastRatio,
  defaultTheme,
  googleFontsUrl,
  newSection,
  parseVideo,
  themeCss,
  themeReferences,
  validateTheme,
} from "./index";

describe("theme engine", () => {
  it("every preset is valid, complete and meets WCAG AA contrast", () => {
    for (const p of PRESETS) {
      const t = p.build();
      const { errors } = validateTheme(JSON.parse(JSON.stringify(t)));
      expect(errors, p.key).toEqual([]);
      expect(contrastProblems(t), p.key).toEqual({});
      for (const k of TEMPLATE_KEYS)
        expect(t.templates[k].length, `${p.key} ${k}`).toBeGreaterThan(0);
      expect(t.groups.header.some((s) => s.type === "header")).toBe(true);
    }
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("every section can be created with its preset and validates", () => {
    const t = defaultTheme();
    for (const def of SECTION_DEFS) {
      const s = newSection(def.type);
      const where =
        "group" in def.enabled_on
          ? { list: t.groups[def.enabled_on.group] }
          : {
              list: t.templates[
                def.main ??
                  (def.enabled_on.templates === "*" ? "home" : def.enabled_on.templates[0]!)
              ],
            };
      expect(s.settings, def.type).toBeTypeOf("object");
      // Replace any existing one-per-list section of the same type.
      where.list.splice(0, where.list.length, ...where.list.filter((x) => x.type !== def.type), s);
    }
    const { errors } = validateTheme(JSON.parse(JSON.stringify(t)));
    expect(errors).toEqual([]);
  });

  it("strict validation reports bad values; lenient falls back to defaults", () => {
    const t = defaultTheme();
    const hero = t.templates.home[0]!;
    hero.settings.button_link = "javascript:alert(1)";
    hero.settings.color_scheme = "scheme-nope";
    t.settings.heading_font = "comic-sans";
    t.templates.home.push({ id: "x", type: "header", settings: {}, blocks: [] });
    const strict = validateTheme(JSON.parse(JSON.stringify(t)));
    expect(strict.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        "settings.heading_font",
        "templates.home.0.settings.button_link",
        "templates.home.0.settings.color_scheme",
        "templates.home.4.type",
      ]),
    );
    const lenient = validateTheme(JSON.parse(JSON.stringify(t)), false);
    expect(lenient.errors).toEqual([]);
    expect(lenient.theme.templates.home[0]!.settings).toMatchObject({
      button_link: "/products",
      color_scheme: "scheme-2" // the field default,
    });
    expect(lenient.theme.templates.home).toHaveLength(4);
  });

  it("keeps each template's main section and refuses a second header", () => {
    const t = defaultTheme();
    t.templates.product = t.templates.product.filter((s) => s.type !== "main_product");
    const r = validateTheme(JSON.parse(JSON.stringify(t)));
    expect(r.errors.map((e) => e.message)).toContain("The page's main section can't be removed");
    expect(r.theme.templates.product[0]!.type).toBe("main_product");
    const two = defaultTheme();
    two.groups.header.push({ ...two.groups.header[1]!, id: "header-2" });
    expect(validateTheme(JSON.parse(JSON.stringify(two))).errors[0]!.message).toBe(
      "Only 1 Header allowed",
    );
  });

  it("limits blocks and checks block settings", () => {
    const t = defaultTheme();
    const s = newSection("image_banner");
    s.blocks.push({ id: "b9", type: "buttons", settings: {} });
    s.blocks[0]!.settings.size = "huge";
    t.templates.home.push(s);
    const errors = validateTheme(JSON.parse(JSON.stringify(t))).errors.map((e) => e.message);
    expect(errors).toEqual(
      expect.arrayContaining(["At most 3 blocks", "Choose one of the options"]),
    );
  });

  it("compiles CSS with one class per color scheme and loads only Google fonts in use", () => {
    const t = PRESETS.find((p) => p.key === "bazaar")!.build();
    const css = themeCss(t);
    expect(css).toContain(":root{--sf-bg:#ffffff");
    expect(css).toContain(".sf-scheme-scheme-3{--sf-bg:#141414");
    expect(css).toContain('--sf-font-heading:"Montserrat"');
    expect(css).toContain("--sf-radius:0px");
    expect(googleFontsUrl(["montserrat", "jost", "sans"])).toBe(
      "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Jost:wght@400;500;600;700&display=swap",
    );
    expect(googleFontsUrl(["sans", "serif"])).toBeNull();
    expect(themeCss(PRESETS[2]!.build())).toContain("--sf-radius:999px");
  });

  it("lists referenced images and menus, and parses video links", () => {
    const t = defaultTheme();
    t.groups.header[1]!.settings.logo = "0b6f3c9e-1d7a-4c55-9a2b-6d1b0c8e7f10";
    expect(themeReferences(t)).toEqual({
      media: ["0b6f3c9e-1d7a-4c55-9a2b-6d1b0c8e7f10"],
      menus: expect.arrayContaining(["main-menu", "footer"]),
    });
    expect(parseVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      id: "dQw4w9WgXcQ",
    });
    expect(parseVideo("https://youtu.be/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
    expect(parseVideo("https://vimeo.com/76979871")).toEqual({ provider: "vimeo", id: "76979871" });
    expect(parseVideo("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("knows where each section can be added", () => {
    const by = (t: string) => SECTION_DEFS.find((d) => d.type === t)!;
    expect(canAddTo(by("image_banner"), { template: "product" })).toBe(true);
    expect(canAddTo(by("image_banner"), { group: "header" })).toBe(false);
    expect(canAddTo(by("product_recommendations"), { template: "home" })).toBe(false);
    expect(canAddTo(by("main_product"), { template: "product" })).toBe(false);
    expect(canAddTo(by("announcement_bar"), { group: "header" })).toBe(true);
  });
});
