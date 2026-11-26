import Link from "next/link";

/** The CartForge mark: an ember square with a C, and the name. */
export function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg bg-ember font-display text-lg font-bold text-white"
      >
        C
      </span>
      <span
        className={`font-display text-xl font-semibold tracking-tight ${tone === "light" ? "text-fg-inverse" : "text-fg"}`}
      >
        CartForge
      </span>
    </Link>
  );
}
