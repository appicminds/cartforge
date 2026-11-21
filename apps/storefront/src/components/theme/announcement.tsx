"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** One announcement at a time; rotates unless motion is reduced or the shopper hovers. */
export function AnnouncementRotator({
  items,
  rotate,
}: {
  items: { id: string; text: string; link: string }[];
  rotate: boolean;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!rotate || paused || items.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % items.length), 5000);
    return () => window.clearInterval(t);
  }, [rotate, paused, items.length]);
  const a = items[Math.min(i, items.length - 1)]!;
  return (
    <p
      data-cf-block={a.id}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-live="polite"
    >
      {a.link ? (
        a.link.startsWith("/") ? (
          <Link href={a.link} className="underline-offset-4 hover:underline">
            {a.text}
          </Link>
        ) : (
          <a href={a.link} rel="noopener noreferrer" className="underline-offset-4 hover:underline">
            {a.text}
          </a>
        )
      ) : (
        a.text
      )}
    </p>
  );
}
