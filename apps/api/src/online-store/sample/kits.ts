import {
  NOOR_COLLECTIONS,
  NOOR_PRODUCTS,
  type SampleCollection,
  type SampleProduct,
} from "./noor-kit";

/** Themes (by preset) that come with sample collections and products. */
export const SAMPLE_KITS: Record<
  string,
  { collections: SampleCollection[]; products: SampleProduct[] }
> = { noor: { collections: NOOR_COLLECTIONS, products: NOOR_PRODUCTS } };

export const hasSampleContent = (preset: string) => Object.hasOwn(SAMPLE_KITS, preset);
