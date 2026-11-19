import { describe, expect, it } from "vitest";
import { storeScoped } from "./store-scope.js";

describe("storeScoped", () => {
  it("adds store_id", () => {
    expect(storeScoped("s1", { status: "active" })).toEqual({ status: "active", store_id: "s1" });
  });
  it("cannot be overridden by caller input", () => {
    expect(storeScoped("s1", { store_id: "attacker" }).store_id).toBe("s1");
  });
  it("requires a store id", () => {
    expect(() => storeScoped("")).toThrow();
  });
});
