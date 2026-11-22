import { presetByKey } from "@cartforge/theme-engine";

/** A small picture of a theme: its color schemes and heading font. */
export function PresetSwatch({ preset, className = "" }: { preset: string; className?: string }) {
  const t = presetByKey(preset)?.build();
  if (!t) return <div className={`rounded-lg bg-surface-sunken ${className}`} />;
  const [a, b, c] = t.color_schemes;
  return (
    <div
      aria-hidden
      className={`grid grid-cols-3 overflow-hidden rounded-lg border border-border ${className}`}
    >
      {[a, b, c].filter(Boolean).map((s) => (
        <div
          key={s!.id}
          className="flex flex-col justify-end gap-1 p-3"
          style={{ background: s!.background, color: s!.text }}
        >
          <span className="text-lg font-semibold leading-none">Aa</span>
          <span className="h-2 w-10 rounded-full" style={{ background: s!.accent }} />
        </div>
      ))}
    </div>
  );
}
