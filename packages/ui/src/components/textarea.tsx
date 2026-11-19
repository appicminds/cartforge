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
        "min-h-20 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg shadow-sm",
        "placeholder:text-fg-subtle focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus/30",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
});
