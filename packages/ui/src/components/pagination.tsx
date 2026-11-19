import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../cn";
import { IconButton } from "./button";

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  pageSizes = [10, 25, 50, 100],
  onPageChange,
  onPageSizeChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  pageSizes?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted",
        className,
      )}
    >
      <p aria-live="polite">
        {total === 0
          ? "No results"
          : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-md border border-border-strong bg-surface px-2 text-sm text-fg"
          >
            {pageSizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <span className="tabular-nums">
          Page {Math.min(page, Math.max(totalPages, 1))} of {Math.max(totalPages, 1)}
        </span>
        <div className="flex gap-1">
          <IconButton
            variant="secondary"
            label="Previous page"
            icon={<ChevronLeft />}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          />
          <IconButton
            variant="secondary"
            label="Next page"
            icon={<ChevronRight />}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          />
        </div>
      </div>
    </nav>
  );
}
