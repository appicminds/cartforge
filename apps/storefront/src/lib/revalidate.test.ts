import { describe, expect, it } from "vitest";
import { secretMatches, tagsFrom } from "./revalidate";

describe("revalidation endpoint helpers", () => {
  it("requires the exact configured secret", () => {
    expect(secretMatches("s3cret-value", "s3cret-value")).toBe(true);
    expect(secretMatches("s3cret-valuX", "s3cret-value")).toBe(false);
    expect(secretMatches("short", "s3cret-value")).toBe(false);
    expect(secretMatches(null, "s3cret-value")).toBe(false);
    // Unconfigured secret disables the endpoint entirely.
    expect(secretMatches("", "")).toBe(false);
  });

  it("only accepts known tags", () => {
    expect(tagsFrom({ tags: ["catalog", "other", 3] })).toEqual(["catalog"]);
    const store = "00000000-0000-4000-8000-000000000001";
    expect(tagsFrom({ tags: [`catalog:${store}`, "catalog:../x"] })).toEqual([`catalog:${store}`]);
    expect(tagsFrom(null)).toEqual([]);
    expect(tagsFrom({ tags: "catalog" })).toEqual([]);
  });
});
