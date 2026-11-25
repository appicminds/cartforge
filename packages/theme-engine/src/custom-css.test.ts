import { describe, expect, it } from "vitest";
import {
  checkCodeCss,
  checkCss,
  defaultTheme,
  scopeCodeCss,
  scopeCss,
  themeCss,
  validateTheme,
} from "./index";

describe("custom CSS", () => {
  it("scopes rules to the section; :scope is the section itself", () => {
    const s = '[data-cf-section="hero"]';
    expect(scopeCss("h2 { color: red } .a, .b:hover { margin: 0 }", s)).toBe(
      `${s} h2{color: red}${s} .a,${s} .b:hover{margin: 0}`,
    );
    expect(scopeCss(":scope { padding: 4px }", s)).toBe(`${s}{padding: 4px}`);
    expect(scopeCss("@media (max-width: 600px) { p { font-size: 14px } }", s)).toBe(
      `@media (max-width: 600px){${s} p{font-size: 14px}}`,
    );
    expect(scopeCss("/* note */ a > span { color: blue }", s)).toBe(`${s} a > span{color: blue}`);
  });

  it("refuses anything that loads, runs or escapes", () => {
    for (const bad of [
      "</style><script>alert(1)</script>",
      "a { background: url(https://evil.example/x.png) }",
      "@import 'https://evil.example/x.css';",
      "a { width: expression(alert(1)) }",
      "a { behavior: url(x.htc) }",
      "a { color: \\72 ed }",
      "@font-face { font-family: x; src: url(x) }",
      "a { color: red",
      "a { b { color: red } }",
      "/* open",
    ]) {
      expect(checkCss(bad), bad).not.toBeNull();
      expect(scopeCss(bad, ".x"), bad).toBe("");
    }
    expect(checkCss("x".repeat(5001))).toMatch(/At most/);
  });

  it("is a setting on every section and in theme settings", () => {
    const t = defaultTheme();
    t.templates.home[0]!.settings.custom_css = "h1 { letter-spacing: 0.05em }";
    t.settings.custom_css = "body { word-spacing: 1px }";
    const ok = validateTheme(JSON.parse(JSON.stringify(t)));
    expect(ok.errors).toEqual([]);
    expect(themeCss(ok.theme)).toContain("body{word-spacing: 1px}");
    t.templates.home[0]!.settings.custom_css = "a { background: url(x) }";
    const bad = validateTheme(JSON.parse(JSON.stringify(t)));
    expect(bad.errors[0]).toMatchObject({ path: "templates.home.0.settings.custom_css" });
  });
});

describe("custom code CSS", () => {
  it("allows https images and fonts, still refuses tricks", () => {
    expect(
      checkCodeCss(".hero { background: url('https://cdn.example.com/a.jpg') center/cover }"),
    ).toBeNull();
    expect(
      checkCodeCss("@font-face { font-family: X; src: url(https://fonts.example.com/x.woff2) }"),
    ).toBeNull();
    expect(checkCodeCss("a { background: url(http://insecure.example/a.png) }")).toMatch(/https/);
    expect(checkCodeCss("a { background: url(javascript:alert(1)) }")).not.toBeNull();
    expect(checkCodeCss("</style><script>x</script>")).not.toBeNull();
    expect(checkCodeCss("@import url(https://x.example/a.css);")).not.toBeNull();
    expect(
      scopeCodeCss(
        ".box { padding: 4px } @font-face { font-family: X; src: url(https://f.example/x.woff2) }",
        ".s",
      ),
    ).toBe(
      ".s .box{padding: 4px}@font-face{ font-family: X; src: url(https://f.example/x.woff2) }",
    );
    expect(scopeCodeCss(".box { padding: 4px }", null)).toBe(".box{padding: 4px}");
  });
});
