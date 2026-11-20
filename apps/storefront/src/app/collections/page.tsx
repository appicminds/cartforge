import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { storefront } from "@/lib/api";

export const metadata: Metadata = {
  title: "Collections",
  alternates: { canonical: "/collections" },
};

export default async function Collections() {
  const cols = (await storefront.collections()).filter((c) => c.product_count > 0);
  return (
    <div className="sf-container py-10 md:py-14">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Collections" }]} />
      <h1 className="mb-10 mt-4 text-3xl md:text-5xl">Collections</h1>
      {cols.length === 0 ? (
        <p className="py-16 text-center text-muted">No collections yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cols.map((c) => (
            <li
              key={c.id}
              className="relative rounded-[calc(var(--sf-radius)/2)] border border-line p-6 transition-colors hover:bg-surface"
            >
              <h2 className="text-xl">
                <Link href={`/collections/${c.handle}`} className="after:absolute after:inset-0">
                  {c.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm text-muted">
                {c.product_count} {c.product_count === 1 ? "product" : "products"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
