"use client";

import { useRef } from "react";

/** GET form: works without JS (Apply button), auto-submits with JS. */
export function SortForm({
  value,
  options,
  hidden,
}: {
  value: string;
  options: { value: string; label: string }[];
  hidden?: Record<string, string>;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} method="get" className="flex items-center gap-2">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor="sort" className="text-sm text-muted">
        Sort by
      </label>
      <select
        id="sort"
        name="sort"
        defaultValue={value}
        className="sf-field sf-select text-sm"
        onChange={() => form.current?.requestSubmit()}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="sf-button" data-variant="outline">
          Apply
        </button>
      </noscript>
    </form>
  );
}
