import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductPage } from "@/components/product-page";
import { storefront } from "@/lib/api";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Preview",
  robots: { index: false, follow: false, nocache: true },
};

const STATUS: Record<string, string> = {
  draft: "Draft — not visible to customers",
  archived: "Archived — not visible to customers",
  active: "Active — this is how customers see it",
};

/** Signed draft preview from the admin (PRD §11.1 "explicit preview capability"). */
export default async function Preview({ params, searchParams }: Props) {
  const { id } = await params;
  const raw = (await searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token) notFound();
  const [r, store] = await Promise.all([storefront.preview(id, token), storefront.store()]);
  if (r.kind !== "ok") notFound();
  const p = r.data;
  return (
    <>
      <div role="status" className="bg-amber-100 text-amber-950">
        <div className="sf-container flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
          <p>
            <strong>Preview.</strong> {STATUS[p.status]}. This link expires within an hour.
          </p>
          {p.status === "active" && (
            <Link href={`/products/${p.handle}`} className="sf-link">
              Open live page
            </Link>
          )}
        </div>
      </div>
      <ProductPage
        product={p}
        store={store}
        structuredData={false}
        canBuy={p.status === "active"}
      />
    </>
  );
}
