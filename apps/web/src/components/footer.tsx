import Link from "next/link";
import { FEATURES, LOGIN_URL, SIGNUP_URL } from "@/lib/site";
import { Logo } from "./logo";

const COLUMNS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  { title: "Features", links: FEATURES.map((f) => ({ href: f.href, label: f.title })) },
  {
    title: "CartForge",
    links: [
      { href: "/#themes", label: "Themes" },
      { href: "/pricing", label: "Pricing" },
      { href: SIGNUP_URL, label: "Start for free", external: true },
      { href: LOGIN_URL, label: "Log in", external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/terms", label: "Terms of service" },
      { href: "/legal/privacy", label: "Privacy policy" },
      { href: "/legal/acceptable-use", label: "Acceptable use" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-ink text-fg-inverse">
      <div className="container-x grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex flex-col gap-4">
          <Logo tone="light" />
          <p className="max-w-xs text-sm text-fg-inverse-muted">
            The commerce platform for building your store, getting paid and growing your brand.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="font-sans text-sm font-semibold tracking-normal text-fg-inverse">
              {c.title}
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {c.links.map((l) =>
                l.external ? (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-fg-inverse-muted hover:text-fg-inverse"
                    >
                      {l.label}
                    </a>
                  </li>
                ) : (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-fg-inverse-muted hover:text-fg-inverse"
                    >
                      {l.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line-dark">
        <div className="container-x flex flex-col gap-2 py-6 text-sm text-fg-inverse-muted sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} CartForge</p>
          <p>Made for independent brands, everywhere.</p>
        </div>
      </div>
    </footer>
  );
}
