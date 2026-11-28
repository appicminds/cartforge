"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { FEATURES, LOGIN_URL, SIGNUP_URL } from "@/lib/site/site";
import { FEATURE_ICONS } from "./icons";
import { Logo } from "./logo";

/**
 * Sticky site header: Features menu, Self-hosted, Developers, Pricing, Log in and
 * Start for free.
 * The phone menu sits outside <header> so its fixed panel is placed against the
 * window, whatever effects the header gets.
 */
export function Header() {
  const path = usePathname();
  const [features, setFeatures] = useState(false);
  const [mobile, setMobile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menus on navigation, Escape and outside clicks.
  useEffect(() => {
    setFeatures(false);
    setMobile(false);
  }, [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFeatures(false);
        setMobile(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setFeatures(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);
  useEffect(() => {
    document.body.style.overflow = mobile ? "hidden" : "";
  }, [mobile]);

  const navLink = "rounded-md px-3 py-2 text-[15px] font-medium text-fg-inverse hover:bg-white/10";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-ink text-fg-inverse">
        <div className="container-x flex h-16 items-center gap-6">
          <Logo tone="light" />
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            <div ref={menuRef} className="relative">
              <button
                type="button"
                className={`${navLink} inline-flex items-center gap-1`}
                aria-expanded={features}
                aria-controls="features-menu"
                onClick={() => setFeatures((v) => !v)}
              >
                Features
                <ChevronDown
                  aria-hidden
                  className={`size-4 transition-transform ${features ? "rotate-180" : ""}`}
                />
              </button>
              {features && (
                <div
                  id="features-menu"
                  className="absolute left-0 top-full mt-2 w-[640px] rounded-2xl border border-line bg-paper p-3 text-fg shadow-xl"
                >
                  <ul className="grid grid-cols-2 gap-1">
                    {FEATURES.map((f) => {
                      const Icon = FEATURE_ICONS[f.icon];
                      return (
                        <li key={f.href}>
                          <Link
                            href={f.href}
                            onClick={() => setFeatures(false)}
                            className="flex gap-3 rounded-xl p-3 hover:bg-paper-2"
                          >
                            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-ember-soft text-ember">
                              <Icon aria-hidden className="size-5" />
                            </span>
                            <span>
                              <span className="block font-semibold">{f.title}</span>
                              <span className="block text-sm text-fg-muted">{f.text}</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            <Link
              href="/self-hosted"
              className={navLink}
              aria-current={path === "/self-hosted" ? "page" : undefined}
            >
              Self-hosted
            </Link>
            <Link href="/#developers" className={navLink}>
              Developers
            </Link>
            <Link
              href="/pricing"
              className={navLink}
              aria-current={path === "/pricing" ? "page" : undefined}
            >
              Pricing
            </Link>
          </nav>
          <div className="ml-auto hidden items-center gap-2 lg:flex">
            <a href={LOGIN_URL} className={navLink}>
              Log in
            </a>
            <a
              href={SIGNUP_URL}
              className="rounded-full bg-white px-5 py-2.5 text-[15px] font-semibold text-ink hover:bg-paper-2"
            >
              Start for free
            </a>
          </div>
          <button
            type="button"
            className="ml-auto inline-flex size-10 items-center justify-center rounded-md text-fg-inverse hover:bg-white/10 lg:hidden"
            aria-expanded={mobile}
            aria-controls="mobile-menu"
            aria-label={mobile ? "Close menu" : "Open menu"}
            onClick={() => setMobile((v) => !v)}
          >
            {mobile ? (
              <X aria-hidden className="size-6" />
            ) : (
              <Menu aria-hidden className="size-6" />
            )}
          </button>
        </div>
      </header>
      {mobile && (
        <div
          id="mobile-menu"
          className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-line bg-paper lg:hidden"
        >
          <nav aria-label="Main" className="container-x flex flex-col gap-1 py-4">
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Features
            </p>
            {FEATURES.map((f) => (
              <Link
                key={f.href}
                href={f.href}
                className="rounded-md px-3 py-3 text-base font-medium hover:bg-paper-2"
              >
                {f.title}
              </Link>
            ))}
            <hr className="my-2 border-line" />
            <Link
              href="/self-hosted"
              className="rounded-md px-3 py-3 text-base font-medium hover:bg-paper-2"
            >
              Self-hosted
            </Link>
            <Link
              href="/pricing"
              className="rounded-md px-3 py-3 text-base font-medium hover:bg-paper-2"
            >
              Pricing
            </Link>
            <a
              href={LOGIN_URL}
              className="rounded-md px-3 py-3 text-base font-medium hover:bg-paper-2"
            >
              Log in
            </a>
            <a
              href={SIGNUP_URL}
              className="mt-3 rounded-full bg-ink px-5 py-3 text-center text-base font-semibold text-white"
            >
              Start for free
            </a>
          </nav>
        </div>
      )}
    </>
  );
}
