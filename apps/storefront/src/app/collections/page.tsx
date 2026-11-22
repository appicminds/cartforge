import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { LG_COLS, MD_COLS } from "@/components/theme/shared";
import { mainSection, TemplateSections } from "@/components/theme/render";
import { storefront } from "@/lib/api";

export const metadata: Metadata = {
  title: "Collections",
  alternates: { canonical: "/collections" },
};

export default async function Collections() {
  const [all, main] = await Promise.all([
    storefront.collections(),
    mainSection("list_collections"),
  ]);
  const cols = all.filter((c) => c.product_count > 0);
  const heading =
    typeof main?.settings.heading === "string" && main.settings.heading
      ? main.settings.heading
      : "Collections";
  const n =
    typeof main?.settings.columns === "number"
      ? Math.min(5, Math.max(2, main.settings.columns))
      : 3;
  return (
    <TemplateSections
      template="list_collections"
      main={() => (
        <div className="sf-container py-10 md:py-14">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: heading }]} />
          <h1 className="mb-10 mt-4 text-3xl md:text-5xl">{heading}</h1>
          {cols.length === 0 ? (
            <p className="py-16 text-center text-muted">No collections yet.</p>
          ) : (
            <ul className={`grid gap-4 sm:grid-cols-2 ${MD_COLS[n]} ${LG_COLS[n]}`}>
              {cols.map((c) => (
                <li
                  key={c.id}
                  className="group relative overflow-hidden rounded-[var(--sf-card-radius)] border border-line transition-colors hover:bg-surface"
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
                      <Link
                        href={`/collections/${c.handle}`}
                        className="after:absolute after:inset-0"
                      >
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
      )}
    />
  );
}
