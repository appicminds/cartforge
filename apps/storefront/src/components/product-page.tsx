import type { SectionInstance } from "@cartforge/theme-engine";
import type { StorefrontProduct, StorefrontStore } from "@cartforge/types";
import { Breadcrumbs } from "./breadcrumbs";
import { ProductView } from "./product-view";
import { site } from "@/lib/config";
import { breadcrumbJsonLd, jsonLd, productJsonLd } from "@/lib/seo";

/** Product detail shared by the live page and signed previews. */
export async function ProductPage({
  product,
  store,
  structuredData = true,
  canBuy = true,
  main,
}: {
  product: StorefrontProduct;
  store: StorefrontStore;
  structuredData?: boolean;
  canBuy?: boolean;
  /** The theme's "Product information" section (blocks and layout). */
  main?: SectionInstance;
}) {
  const { siteUrl } = await site();
  const url = `${siteUrl}/products/${product.handle}`;
  const category = product.categories[0];
  const crumbs = [
    { name: "Home", href: "/" },
    category
      ? { name: category.name, href: `/categories/${category.handle}` }
      : { name: "All products", href: "/products" },
    { name: product.title, href: `/products/${product.handle}` },
  ];
  return (
    <div className="sf-container py-8 md:py-12">
      {structuredData && (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd(product, url)) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: jsonLd(
                breadcrumbJsonLd(crumbs.map((c) => ({ name: c.name, url: `${siteUrl}${c.href}` }))),
              ),
            }}
          />
        </>
      )}
      <div className="mb-6">
        <Breadcrumbs items={crumbs} />
      </div>
      <ProductView
        product={product}
        locale={store.locale}
        canBuy={canBuy}
        blocks={main?.blocks.filter((b) => !b.disabled)}
        galleryRight={main?.settings.gallery_position === "right"}
        stickyInfo={main?.settings.sticky_info !== false}
      />
    </div>
  );
}
