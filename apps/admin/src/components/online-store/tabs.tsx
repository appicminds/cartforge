"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/online-store", label: "Themes" },
  { href: "/admin/online-store/pages", label: "Pages" },
  { href: "/admin/online-store/blog", label: "Blog posts" },
  { href: "/admin/online-store/navigation", label: "Navigation" },
];

/** Online store: Themes | Pages | Navigation. */
export function OnlineStoreTabs() {
  const path = usePathname();
  const active = [...TABS]
    .reverse()
    .find((t) => path === t.href || path.startsWith(`${t.href}/`))?.href;
  return (
    <nav aria-label="Online store" className="flex gap-6 border-b border-border">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active === t.href ? "page" : undefined}
          className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${active === t.href ? "border-primary text-fg" : "border-transparent text-fg-muted hover:text-fg"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
