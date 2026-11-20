export const metadata = { title: "Store not found", robots: { index: false, follow: false } };

/** Hosts that don't belong to any store (or a suspended one). Rendered without the store layout's data. */
export default function StoreNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-3xl">This store isn’t available</h1>
      <p className="mt-3 max-w-md text-muted">
        The address may be mistyped, or the store may have closed or moved.
      </p>
    </div>
  );
}
