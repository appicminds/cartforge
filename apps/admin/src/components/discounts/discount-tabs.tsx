"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Discounts | Sales — two ways to lower prices, side by side. */
export function DiscountTabs() {
  const path = usePathname();
  const sales = path.startsWith("/admin/discounts/sales");
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${on ? "border-primary text-fg" : "border-transparent text-fg-muted hover:text-fg"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Discounts" className="flex gap-6 border-b border-border">
      {tab("/admin/discounts", "Discounts", !sales)}
      {tab("/admin/discounts/sales", "Sales", sales)}
    </nav>
  );
}
