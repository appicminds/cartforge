"use client";

import { useCallback, useRef, useState } from "react";

const LIMIT = 100;
/** Edits to the same setting within this window are one undo step (typing). */
const COALESCE_MS = 800;

/**
 * Undo/redo for the theme being edited. `change` clones the current state, lets
 * the caller mutate the copy, and records it; repeated edits to the same key
 * in quick succession (typing in a field) are merged into one step.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] });
  const last = useRef<{ key: string; at: number } | null>(null);

  const change = useCallback((fn: (draft: T) => void, key?: string) => {
    setState((s) => {
      const next = structuredClone(s.present);
      fn(next);
      const now = Date.now();
      const merge = !!key && last.current?.key === key && now - last.current.at < COALESCE_MS;
      last.current = key ? { key, at: now } : null;
      return merge
        ? { ...s, present: next, future: [] }
        : { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    last.current = null;
    setState((s) =>
      s.past.length
        ? {
            past: s.past.slice(0, -1),
            present: s.past[s.past.length - 1]!,
            future: [s.present, ...s.future],
          }
        : s,
    );
  }, []);

  const redo = useCallback(() => {
    last.current = null;
    setState((s) =>
      s.future.length
        ? { past: [...s.past, s.present], present: s.future[0]!, future: s.future.slice(1) }
        : s,
    );
  }, []);

  const reset = useCallback((value: T) => {
    last.current = null;
    setState({ past: [], present: value, future: [] });
  }, []);

  return {
    present: state.present,
    change,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
