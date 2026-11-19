import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "../cn";

/** Styled native select: fully keyboard/screen-reader accessible by default. */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function Select({ className, invalid, children, ...props }, ref) {
  return (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-9 w-full appearance-none rounded-md border border-border-strong bg-surface pl-3 pr-8 text-sm text-fg shadow-sm",
          "focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus/30",
          "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-70 aria-invalid:border-danger",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
      />
    </div>
  );
});
