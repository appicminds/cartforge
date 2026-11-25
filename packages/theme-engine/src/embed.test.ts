import { describe, expect, it } from "vitest";
import { defaultTheme, newSection, parseEmbed, validateTheme } from "./index";

describe("embeds", () => {
  it("turns links from known providers into their embed address", () => {
    expect(parseEmbed("https://www.instagram.com/p/C0abcDEF123/")).toMatchObject({
      provider: "instagram",
      src: "https://www.instagram.com/p/C0abcDEF123/embed",
    });
    expect(parseEmbed("https://www.tiktok.com/@silsila/video/7300000000000000000")?.src).toBe(
      "https://www.tiktok.com/embed/v2/7300000000000000000",
    );
    expect(parseEmbed("https://www.google.com/maps/place/Liberty+Market+Lahore")?.src).toBe(
      "https://maps.google.com/maps?q=Liberty%20Market%20Lahore&output=embed",
    );
    expect(parseEmbed("https://www.google.com/maps/embed?pb=!1m18!1m12")?.provider).toBe("maps");
    expect(
      parseEmbed("https://docs.google.com/forms/d/e/1FAIpQLSexampleexampleexample/viewform")?.src,
    ).toBe(
      "https://docs.google.com/forms/d/e/1FAIpQLSexampleexampleexample/viewform?embedded=true",
    );
    expect(parseEmbed("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")?.src).toBe(
      "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M",
    );
    expect(parseEmbed("https://www.facebook.com/silsilastudio")?.src).toContain(
      "plugins/page.php?href=",
    );
    expect(parseEmbed("https://youtu.be/dQw4w9WgXcQ")?.src).toContain(
      "youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
  });

  it("refuses anything else", () => {
    for (const bad of [
      "http://www.instagram.com/p/C0abcDEF123/",
      "https://evil.example/embed",
      'https://www.instagram.com/p/C0abc"onload=x/',
      "<iframe src=https://evil.example></iframe>",
      "javascript:alert(1)",
    ])
      expect(parseEmbed(bad), bad).toBeNull();
  });

  it("custom section and embed section validate, including block columns and dates", () => {
    const t = defaultTheme();
    const c = newSection("custom_section");
    c.blocks.push(
      {
        id: "cd",
        type: "countdown",
        settings: { ends_at: "2026-12-31T19:00:00.000Z", column: "2" },
      },
      { id: "em", type: "embed", settings: { url: "https://www.instagram.com/reel/C0abcDEF123/" } },
    );
    const e = newSection("embed");
    e.settings.url = "https://www.google.com/maps/place/Lahore";
    t.templates.home.push(c, e);
    expect(validateTheme(JSON.parse(JSON.stringify(t))).errors).toEqual([]);
    c.blocks.push({ id: "bad", type: "embed", settings: { url: "https://evil.example/x" } });
    c.blocks.push({ id: "bad2", type: "countdown", settings: { ends_at: "soon" } });
    const errs = validateTheme(JSON.parse(JSON.stringify(t))).errors.map((x) => x.message);
    expect(errs).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Use a link from YouTube/),
        "Choose a date and time",
      ]),
    );
  });
});
