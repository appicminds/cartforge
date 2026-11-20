import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ProductPage } from "@/components/product-page";
import { lastSegment, storefront } from "@/lib/api";

type Props = { params: Promise<{ handle: string }> };

async function load(handle: string) {
  const r = await storefront.product(handle);
  // Renamed product: old links keep working (PRD §8.4 H, handle redirects).
  if (r.kind === "moved") permanentRedirect(`/products/${lastSegment(r.to)}`);
  if (r.kind === "not_found") notFound();
  return r.data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load((await params).handle);
  const image = p.images[0];
  const path = `/products/${p.handle}`;
  return {
    title: p.seo.title,
    description: p.seo.description || undefined,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title: p.seo.title,
      description: p.seo.description || undefined,
      url: path,
      images: image
        ? [{ url: image.large_url ?? image.url, alt: image.alt ?? p.title }]
        : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary" },
  };
}

export default async function Product({ params }: Props) {
  const { handle } = await params;
  const [product, store] = await Promise.all([load(handle), storefront.store()]);
  return <ProductPage product={product} store={store} />;
}
