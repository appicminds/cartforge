/**
 * Photographs used on the site (free stock, Unsplash License). A slot without a
 * file shows a designed fallback, so the page works before photos are added.
 * Put files in public/photos/ and fill in `src` and the credit.
 */
export interface Photo {
  src: string | null;
  alt: string;
  credit?: string;
}

export const PHOTOS: Record<"founder" | "packing" | "global", Photo> = {
  founder: { src: null, alt: "A shop owner arranging products in her studio" },
  packing: { src: null, alt: "Orders being packed for shipping" },
  global: { src: null, alt: "Parcels ready to ship around the world" },
};
