"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BreadcrumbTitleProvider } from "@/lib/breadcrumbs";
import { DesktopSidebar, MobileSidebar } from "./sidebar";
import { Topbar } from "./topbar";

const COLLAPSE_KEY = "cf:sidebar-collapsed";

export function AdminShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });

  return (
    <BreadcrumbTitleProvider>
      <div className="flex min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-(--cf-z-toast) focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-md"
        >
          Skip to content
        </a>
        <DesktopSidebar collapsed={collapsed} onToggle={toggle} />
        <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onOpenNav={() => setMobileOpen(true)} />
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-(--cf-content-max) flex-1 px-4 py-6 sm:px-6 lg:py-8"
          >
            {children}
          </main>
        </div>
      </div>
    </BreadcrumbTitleProvider>
  );
}
