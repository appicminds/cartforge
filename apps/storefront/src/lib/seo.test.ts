import type { StorefrontProduct } from "@cartforge/types";
import { describe, expect, it } from "vitest";
import { jsonLd, productJsonLd } from "./seo";

const product = (over: Partial<StorefrontProduct> = {}): StorefrontProduct => ({
  id: "p",
  handle: "kettle",
  title: "Kettle",
  description_html: "",
  vendor: "Acme",
  currency: "USD",
  price_min_minor: 1999,
  price_max_minor: 1999,
  compare_at_min_minor: null,
  available: true,
  images: [],
  options: [],
  variants: [
    {
      id: "v",
      title: "Default",
      options: [],
      price_minor: 1999,
      compare_at_minor: null,
      available: true,
      image_index: null,
    },
  ],
  tags: [],
  categories: [],
  seo: { title: "Kettle", description: "Boils water" },
  published_at: null,
  updated_at: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("structured data", () => {
  it("describes a single-price product as an Offer", () => {
    const ld = productJsonLd(product(), "https://shop.test/products/kettle");
    expect(ld.offers).toEqual({
      "@type": "Offer",
      url: "https://shop.test/products/kettle",
      priceCurrency: "USD",
      price: "19.99",
      availability: "https://schema.org/InStock",
    });
    expect(ld.brand).toEqual({ "@type": "Brand", name: "Acme" });
  });

  it("uses an AggregateOffer for price ranges and omits offers without a price", () => {
    const v = product().variants[0]!;
    const ranged = productJsonLd(
      product({
        price_max_minor: 2999,
        available: false,
        variants: [v, { ...v, id: "w", price_minor: 2999 }],
      }),
      "u",
    );
    expect(ranged.offers).toMatchObject({
      "@type": "AggregateOffer",
      lowPrice: "19.99",
      highPrice: "29.99",
      offerCount: 2,
      availability: "https://schema.org/OutOfStock",
    });
    expect(productJsonLd(product({ price_min_minor: null }), "u").offers).toBeUndefined();
  });

  it("can't break out of the script tag", () => {
    expect(jsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});
