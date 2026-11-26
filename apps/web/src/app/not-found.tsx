import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-x flex flex-col items-center gap-5 py-32 text-center">
      <p className="font-display text-7xl font-semibold text-ember">404</p>
      <h1 className="text-3xl font-semibold">This page doesn&apos;t exist</h1>
      <p className="text-fg-muted">It may have moved, or the link may be wrong.</p>
      <Link
        href="/"
        className="rounded-full bg-ink px-6 py-3 font-semibold text-white hover:bg-ink-3"
      >
        Back to the home page
      </Link>
    </div>
  );
}
