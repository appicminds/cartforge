import Link from "next/link";

export default function NotFound() {
  return (
    <div className="sf-container flex flex-col items-center py-24 text-center">
      <p className="text-sm uppercase tracking-wider text-muted">404</p>
      <h1 className="mt-3 text-3xl md:text-5xl">Page not found</h1>
      <p className="mt-4 max-w-md text-muted">
        The page you’re looking for doesn’t exist or is no longer available.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/products" className="sf-button">
          Browse products
        </Link>
        <Link href="/" className="sf-button" data-variant="outline">
          Go home
        </Link>
      </div>
    </div>
  );
}
