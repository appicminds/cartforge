"use client";

import { useEffect, useRef } from "react";

/**
 * Sends the shopper to a provider that expects a form post (JazzCash, Easypaisa).
 * Submits by itself; the button is there if scripts are off or it's slow.
 */
export function AutoPost({
  url,
  fields,
  label,
}: {
  url: string;
  fields: Record<string, string>;
  label: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.submit();
  }, []);
  return (
    <form ref={form} method="post" action={url} className="mt-6">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className="sf-button">
        {label}
      </button>
    </form>
  );
}
