"use client";

import { useFormStatus } from "react-dom";

/** Disables itself while its form's server action runs (no double submits). */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
  pending: pendingProp,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  /** For forms submitted via startTransition (useFormStatus doesn't see those). */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button type="submit" className={className} disabled={disabled || pending} aria-busy={pending}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
