import { describe, expect, it } from "vitest";
import { childrenIndex, depthOf, heightOf, isSelfOrDescendant, type Node } from "./category-tree";

const nodes: Node[] = [
  { id: "a", parent_id: null },
  { id: "b", parent_id: "a" },
  { id: "c", parent_id: "b" },
  { id: "d", parent_id: null },
];
const byId = new Map(nodes.map((n) => [n.id, n]));

describe("category tree", () => {
  it("computes depth and subtree height", () => {
    expect(depthOf("a", byId)).toBe(0);
    expect(depthOf("c", byId)).toBe(2);
    expect(depthOf(null, byId)).toBe(-1);
    expect(heightOf("a", childrenIndex(nodes))).toBe(2);
    expect(heightOf("d", childrenIndex(nodes))).toBe(0);
  });
  it("detects cycles", () => {
    expect(isSelfOrDescendant("a", "c", byId)).toBe(true);
    expect(isSelfOrDescendant("a", "a", byId)).toBe(true);
    expect(isSelfOrDescendant("c", "a", byId)).toBe(false);
    expect(isSelfOrDescendant("a", "d", byId)).toBe(false);
  });
  it("survives corrupted cyclic data", () => {
    const bad = new Map<string, Node>([
      ["x", { id: "x", parent_id: "y" }],
      ["y", { id: "y", parent_id: "x" }],
    ]);
    expect(depthOf("x", bad)).toBe(Number.POSITIVE_INFINITY);
  });
});
