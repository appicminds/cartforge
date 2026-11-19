import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "../cn";

/** Table primitives with horizontal overflow for narrow screens (PRD §5.2). */
export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="border-b border-border bg-surface-sunken" {...props} />;
}

export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="divide-y divide-border" {...props} />;
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-surface-hover", className)} {...props} />;
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "h-8 whitespace-nowrap px-3 text-left text-xs font-medium text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2 align-middle text-fg", className)} {...props} />;
}

export type SortDirection = "asc" | "desc";

/** Column header that toggles sort; exposes aria-sort for assistive tech. */
export function SortableTh({
  children,
  active,
  direction,
  onSort,
  className,
}: {
  children: ReactNode;
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
  className?: string;
}) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <Th
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={className}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-fg",
          active && "text-fg",
        )}
      >
        {children}
        <Icon aria-hidden className={cn("size-3.5", !active && "opacity-40")} />
      </button>
    </Th>
  );
}
