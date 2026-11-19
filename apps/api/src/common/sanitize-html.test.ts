import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "./sanitize-html";

describe("sanitizeRichText", () => {
  it("keeps allowed formatting", () => {
    const html = "<h2>Care</h2><p><strong>Bold</strong> and <em>it</em></p><ul><li>One</li></ul>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  it.each([
    ["<script>alert(1)</script><p>x</p>", "<p>x</p>"],
    ['<p onclick="steal()">x</p>', "<p>x</p>"],
    ['<a href="javascript:alert(1)">x</a>', "x"],
    ["<img src=x onerror=alert(1)>", ""],
    ['<iframe src="https://evil"></iframe>', ""],
    ['<p style="position:fixed">x</p>', "<p>x</p>"],
    ['<a href="//evil.example">x</a>', "x"],
  ])("strips dangerous markup: %s", (input, expected) => {
    expect(sanitizeRichText(input)).toBe(expected);
  });

  it("hardens target=_blank links", () => {
    expect(sanitizeRichText('<a href="https://x.test" target="_blank" rel="opener">x</a>')).toBe(
      '<a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a>',
    );
  });

  it("normalizes empty editor output", () => {
    expect(sanitizeRichText("<p></p>")).toBe("");
  });
});
