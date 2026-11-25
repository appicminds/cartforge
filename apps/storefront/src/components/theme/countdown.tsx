"use client";

import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

/** Days, hours, minutes and seconds until `endsAt`; then the ended text (or nothing). */
export function Countdown({
  endsAt,
  title,
  endedText,
  hideWhenEnded,
}: {
  endsAt: string;
  title: string;
  endedText: string;
  hideWhenEnded: boolean;
}) {
  const end = Date.parse(endsAt);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (now === null) return <div className="h-20" aria-hidden />;
  const left = Math.max(0, end - now);
  if (!left) return hideWhenEnded ? null : <p className="text-lg font-medium">{endedText}</p>;
  const s = Math.floor(left / 1000);
  const parts: [number, string][] = [
    [Math.floor(s / 86400), "Days"],
    [Math.floor((s % 86400) / 3600), "Hours"],
    [Math.floor((s % 3600) / 60), "Minutes"],
    [s % 60, "Seconds"],
  ];
  return (
    <div>
      {title && <p className="mb-3 text-sm font-semibold uppercase tracking-wider">{title}</p>}
      <p className="sr-only">
        {parts[0]![0]} days, {parts[1]![0]} hours and {parts[2]![0]} minutes left
      </p>
      <div aria-hidden className="flex gap-3">
        {parts.map(([v, label]) => (
          <div
            key={label}
            className="min-w-16 rounded-[var(--sf-card-radius)] border border-line bg-surface px-3 py-2 text-center"
          >
            <div className="font-heading text-3xl tabular-nums">{pad(v)}</div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
