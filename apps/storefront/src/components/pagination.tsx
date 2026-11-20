import Link from "next/link";

/** Plain links: crawlable and usable without JavaScript. */
export function Pagination({
  page,
  totalPages,
  href,
}: {
  page: number;
  totalPages: number;
  href: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const pages = new Set(
    [1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages),
  );
  const list = [...pages].sort((a, b) => a - b);
  const item = "flex h-10 min-w-10 items-center justify-center rounded-[var(--sf-radius)] px-3";
  return (
    <nav aria-label="Pagination" className="mt-12 flex justify-center">
      <ul className="flex items-center gap-1">
        {page > 1 && (
          <li>
            <Link href={href(page - 1)} rel="prev" className={`${item} hover:bg-surface`}>
              <span aria-hidden>←</span>
              <span className="sr-only">Previous page</span>
            </Link>
          </li>
        )}
        {list.map((p, i) => (
          <li key={p} className="flex items-center gap-1">
            {i > 0 && p - list[i - 1]! > 1 && (
              <span aria-hidden className="px-1 text-muted">
                …
              </span>
            )}
            {p === page ? (
              <span aria-current="page" className={`${item} bg-accent text-on-accent`}>
                <span className="sr-only">Page </span>
                {p}
              </span>
            ) : (
              <Link href={href(p)} className={`${item} hover:bg-surface`}>
                <span className="sr-only">Page </span>
                {p}
              </Link>
            )}
          </li>
        ))}
        {page < totalPages && (
          <li>
            <Link href={href(page + 1)} rel="next" className={`${item} hover:bg-surface`}>
              <span aria-hidden>→</span>
              <span className="sr-only">Next page</span>
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
