"use client";

import { Children, useEffect, useState, type ReactNode } from "react";

/** Slides with dots and arrows; autoplay pauses on hover/focus and when motion is reduced. */
export function Slideshow({
  children,
  autoplay,
  seconds,
  count,
  height,
}: {
  children: ReactNode;
  autoplay: boolean;
  seconds: number;
  count: number;
  height: string;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const slides = Children.toArray(children);
  useEffect(() => {
    if (!autoplay || paused || count < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % count), seconds * 1000);
    return () => window.clearInterval(t);
  }, [autoplay, paused, count, seconds]);
  const go = (n: number) => setI((n + count) % count);
  return (
    <div
      className={`relative ${height}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {slides.map((s, n) => (
        <div
          key={n}
          aria-roledescription="slide"
          aria-label={`${n + 1} of ${count}`}
          aria-hidden={n !== i}
          inert={n !== i}
          className={`absolute inset-0 transition-opacity duration-700 ${n === i ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {s}
        </div>
      ))}
      {count > 1 && (
        <div className="absolute inset-x-0 bottom-4 z-20 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => go(i - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          >
            <span aria-hidden>‹</span>
            <span className="sr-only">Previous slide</span>
          </button>
          {slides.map((_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => go(n)}
              aria-current={n === i ? "true" : undefined}
              className={`h-2.5 rounded-full transition-all ${n === i ? "w-6 bg-white" : "w-2.5 bg-white/60"}`}
            >
              <span className="sr-only">Show slide {n + 1}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => go(i + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
          >
            <span aria-hidden>›</span>
            <span className="sr-only">Next slide</span>
          </button>
        </div>
      )}
    </div>
  );
}
