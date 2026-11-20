/** Set by middleware only; incoming copies from clients are always overwritten. */
export const STORE_HEADER = "x-cf-store-id";
export const SITE_HEADER = "x-cf-site-url";
/** Set when the host belongs to no (active) store: the layout renders without store data. */
export const NO_STORE_HEADER = "x-cf-no-store";
