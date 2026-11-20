/** Set by middleware only; incoming copies from clients are always overwritten. */
export const STORE_HEADER = "x-cf-store-id";
export const SITE_HEADER = "x-cf-site-url";
/** Set when the host belongs to no (active) store: the layout renders without store data. */
export const NO_STORE_HEADER = "x-cf-no-store";
/** Set when a store without a domain is being previewed on the shared address (`/?store=<handle>`). */
export const PREVIEW_HEADER = "x-cf-store-preview";
/** Remembers the previewed store's handle between pages. */
export const PREVIEW_COOKIE = "cf_store_preview";
/** Query parameter that starts (`?store=<handle>`) or ends (`?store=`) a preview. */
export const PREVIEW_PARAM = "store";
