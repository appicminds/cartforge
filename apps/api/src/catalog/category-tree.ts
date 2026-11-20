/** Pure helpers for the category tree (depth limit + cycle prevention, PRD §8.6). */
export interface Node {
  id: string;
  parent_id: string | null;
}

export function depthOf(id: string | null, byId: Map<string, Node>): number {
  let d = -1;
  let cur = id;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) return Number.POSITIVE_INFINITY; // corrupted data: treat as too deep
    seen.add(cur);
    d += 1;
    cur = byId.get(cur)?.parent_id ?? null;
  }
  return d;
}

/** Height of a subtree: 0 for a leaf. */
export function heightOf(id: string, children: Map<string | null, Node[]>): number {
  const kids = children.get(id) ?? [];
  return kids.length ? 1 + Math.max(...kids.map((k) => heightOf(k.id, children))) : 0;
}

/** True when `candidate` is `id` itself or one of its descendants. */
export function isSelfOrDescendant(
  id: string,
  candidate: string,
  byId: Map<string, Node>,
): boolean {
  let cur: string | null = candidate;
  const seen = new Set<string>();
  while (cur) {
    if (cur === id) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = byId.get(cur)?.parent_id ?? null;
  }
  return false;
}

export function childrenIndex<T extends Node>(nodes: T[]): Map<string | null, T[]> {
  const m = new Map<string | null, T[]>();
  for (const n of nodes) {
    const list = m.get(n.parent_id) ?? [];
    list.push(n);
    m.set(n.parent_id, list);
  }
  return m;
}
