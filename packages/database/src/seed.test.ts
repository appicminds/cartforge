import { describe, expect, it } from "vitest";
import { SEED_PASSWORD, resolveSeedPassword } from "./seed.js";

describe("resolveSeedPassword", () => {
  it("uses the dev password locally", () => {
    expect(resolveSeedPassword({ NODE_ENV: "development" })).toBe(SEED_PASSWORD);
  });
  it("refuses production without the demo flag", () => {
    expect(() => resolveSeedPassword({ NODE_ENV: "production" })).toThrow(/Refusing/);
  });
  it("requires a private, long-enough password for demos", () => {
    expect(() => resolveSeedPassword({ CARTFORGE_DEMO_SEED: "true" })).toThrow(/SEED_PASSWORD/);
    expect(() =>
      resolveSeedPassword({ CARTFORGE_DEMO_SEED: "true", SEED_PASSWORD: "short" }),
    ).toThrow();
    expect(
      resolveSeedPassword({
        CARTFORGE_DEMO_SEED: "true",
        NODE_ENV: "production",
        SEED_PASSWORD: "a-long-private-pw",
      }),
    ).toBe("a-long-private-pw");
  });
});
