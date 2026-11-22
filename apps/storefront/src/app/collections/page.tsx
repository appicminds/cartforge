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
              className="group relative overflow-hidden rounded-[calc(var(--sf-radius)/2)] border border-line transition-colors hover:bg-surface"
            >
              {c.image && (
                <div className="aspect-[4/3] overflow-hidden bg-surface">
                  <img
                    src={c.image.medium_url ?? c.image.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
              )}
              <div className="p-6">
                <h2 className="text-xl">
                  <Link href={`/collections/${c.handle}`} className="after:absolute after:inset-0">
                    {c.title}
                  </Link>
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {c.product_count} {c.product_count === 1 ? "product" : "products"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
