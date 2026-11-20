import { describe, expect, it } from "vitest";
import {
  contrastProblems,
  contrastRatio,
  DEFAULT_THEME,
  resolveTheme,
  templateSchema,
  themeCss,
  themeSettingsSchema,
} from "./index";

describe("theme engine", () => {
  it("resolves the default theme with defaulted section settings", () => {
    const t = resolveTheme();
    expect(t.key).toBe("foundry");
    const hero = t.templates.home.sections.find((s) => s.type === "hero");
    expect(hero?.settings).toMatchObject({ heading: "", button_link: "/products" });
    const newest = t.templates.home.sections.find((s) => s.type === "new_arrivals");
    expect(newest?.settings).toMatchObject({ heading: "New arrivals", limit: 8 });
  });

  it("ships a default theme that meets WCAG AA contrast", () => {
    expect(contrastProblems(resolveTheme().settings)).toEqual([]);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("applies partial overrides and reports poor contrast", () => {
    const t = resolveTheme(DEFAULT_THEME, {
      settings: { colors: { accent: "#FFEE00" }, buttons: { radius: 999 } },
    });
    expect(t.settings.colors.accent).toBe("#ffee00");
    expect(t.settings.colors.background).toBe("#ffffff");
    expect(t.settings.buttons.radius).toBe(999);
    expect(contrastProblems(t.settings)).toEqual([
      expect.stringContaining("Button text on accent"),
    ]);
  });

  it("only accepts safe values, so compiled CSS can't be escaped", () => {
    const bad = structuredClone(DEFAULT_THEME.settings);
    (bad.colors as Record<string, string>).text = "red;}</style><script>";
    expect(themeSettingsSchema.safeParse(bad).success).toBe(false);
    const fonty = structuredClone(DEFAULT_THEME.settings) as unknown as {
      typography: { body_font: string };
    };
    fonty.typography.body_font = "Comic Sans";
    expect(themeSettingsSchema.safeParse(fonty).success).toBe(false);
    const css = themeCss(resolveTheme().settings);
    expect(css).toMatch(/^:root\{--sf-bg:#ffffff;/);
    expect(css).not.toMatch(/[<>]/);
  });

  it("strips control characters from plain-text settings", () => {
    const s = structuredClone(DEFAULT_THEME.settings);
    s.header.announcement = "Free shipping\u0000 today ";
    expect(themeSettingsSchema.parse(s).header.announcement).toBe("Free shipping  today");
  });

  it("rejects unknown sections, external links, bad settings and duplicate ids", () => {
    const parse = (sections: unknown[]) => templateSchema.safeParse({ sections });
    expect(parse([{ id: "a", type: "script", settings: {} }]).success).toBe(false);
    expect(
      parse([{ id: "a", type: "hero", settings: { button_link: "https://evil.example" } }]).success,
    ).toBe(false);
    expect(
      parse([{ id: "a", type: "hero", settings: { button_link: "javascript:alert(1)" } }]).success,
    ).toBe(false);
    expect(
      parse([{ id: "a", type: "hero", settings: { button_link: "//evil.example" } }]).success,
    ).toBe(false);
    expect(parse([{ id: "a", type: "new_arrivals", settings: { limit: 99 } }]).success).toBe(false);
    expect(
      parse([
        { id: "a", type: "rich_text", settings: {} },
        { id: "a", type: "rich_text", settings: {} },
      ]).success,
    ).toBe(false);
    const ok = parse([{ id: "x", type: "featured_collection", settings: { collection: "gifts" } }]);
    expect(ok.success && ok.data.sections[0]).toEqual({
      id: "x",
      type: "featured_collection",
      settings: { heading: "", collection: "gifts", limit: 4 },
    });
  });
});
