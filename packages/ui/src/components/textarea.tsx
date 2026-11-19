import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../cn";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-20 w-full rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-sm text-fg",
        "placeholder:text-fg-subtle focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus/30",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
});
