"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

/** Values as removable chips. Enter, comma or Tab adds; Backspace on empty removes the last. */
export function TagInput({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const add = (raw: string) => {
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const next = [...values];
    for (const p of parts)
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 80));
    onChange(next);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === "," || (e.key === "Tab" && text.trim())) && text.trim()) {
      e.preventDefault();
      add(text);
    } else if (e.key === "Backspace" && !text && values.length) {
      onChange(values.slice(0, -1));
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-fg">
        {label}
      </label>
      <div
        className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2 py-1 focus-within:border-focus focus-within:outline-2 focus-within:outline-focus/30"
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-0.5 text-xs"
          >
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="rounded text-fg-muted hover:text-fg"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={text}
          onChange={(e) =>
            e.target.value.includes(",") ? add(e.target.value) : setText(e.target.value)
          }
          onKeyDown={onKey}
          onBlur={() => text.trim() && add(text)}
          placeholder={values.length ? "" : "Type a value and press Enter"}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none"
        />
      </div>
    </div>
  );
}
