/** A labelled checkbox with an optional description (settings pages). */
export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-[var(--cf-color-primary)]"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-fg-muted">{description}</span>}
      </span>
    </label>
  );
}
