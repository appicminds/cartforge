"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Custom code with scripts, in a sandboxed frame: no access to the store's
 * cookies, storage or page (its origin is opaque), yet links can open the
 * store's pages when clicked. The frame reports its height so it fits.
 */
export function CodeFrame({ srcDoc, title }: { srcDoc: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(150);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const h = (e.data as { cfCodeHeight?: unknown })?.cfCodeHeight;
      if (typeof h === "number" && Number.isFinite(h))
        setHeight(Math.min(10_000, Math.max(20, Math.ceil(h))));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation"
      loading="lazy"
      className="block w-full border-0"
      style={{ height }}
    />
  );
}
