import type { ReactNode } from "react";
import { cn } from "../cn";

/** Page title, explanatory text, primary + secondary actions (PRD §5.1). */
export function PageHeader({
  title,
  description,
  primaryAction,
  secondaryActions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {(primaryAction || secondaryActions) && (
        <div className="flex flex-wrap items-center gap-2">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}
    >
      {icon && (
        <div
          aria-hidden
          className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-sunken text-fg-muted [&_svg]:size-6"
        >
          {icon}
        </div>
      )}
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({
  items,
  renderLink,
}: {
  items: BreadcrumbItem[];
  renderLink: (item: BreadcrumbItem & { href: string }, className: string) => ReactNode;
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-fg-muted">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden className="text-fg-subtle">
                  /
                </span>
              )}
              {item.href && !last ? (
                renderLink({ ...item, href: item.href }, "truncate hover:text-fg")
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn("truncate", last && "font-medium text-fg")}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
