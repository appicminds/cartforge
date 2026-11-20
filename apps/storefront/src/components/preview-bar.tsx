/**
 * Shown while a store without its own domain is previewed on the shared address.
 * "Exit preview" is a plain link (`?store=`), so it works without JavaScript.
 */
export function PreviewBar({ storeName }: { storeName: string }) {
  return (
    <aside
      aria-label="Store preview"
      className="bg-ink px-4 py-2 text-center text-sm text-bg"
      data-testid="preview-bar"
    >
      Previewing <strong>{storeName}</strong>. This store has no public address yet.{" "}
      <a href="/?store=" className="font-medium underline underline-offset-2">
        Exit preview
      </a>
    </aside>
  );
}
