"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Image banners that slide. Slides are stacked in one grid cell, so the slider
 * takes the natural height of the pictures (nothing is cropped).
 */
export function ImageSlider({
  slides,
  autoplay,
  seconds,
  rounded,
}: {
  slides: ReactNode[];
  autoplay: boolean;
  seconds: number;
  rounded: boolean;
}) {
  const count = slides.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!autoplay || paused || count < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((x) => (x + 1) % count), seconds * 1000);
    return () => window.clearInterval(t);
  }, [autoplay, paused, count, seconds]);
  const go = (n: number) => setI((n + count) % count);
  return (
    <div
      className={`relative ${rounded ? "overflow-hidden rounded-[var(--sf-card-radius)]" : ""}`}
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="grid">
        {slides.map((s, n) => (
          <div
            key={n}
            aria-roledescription="slide"
            aria-label={`${n + 1} of ${count}`}
            aria-hidden={n !== i}
            inert={n !== i}
            className={`[grid-area:1/1] transition-opacity duration-700 ${n === i ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            {s}
          </div>
        ))}
      </div>
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(i - 1)}
            className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-xl text-black shadow hover:bg-white"
          >
            <span aria-hidden>‹</span>
            <span className="sr-only">Previous banner</span>
          </button>
          <button
            type="button"
            onClick={() => go(i + 1)}
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-xl text-black shadow hover:bg-white"
          >
            <span aria-hidden>›</span>
            <span className="sr-only">Next banner</span>
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {slides.map((_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => go(n)}
                aria-current={n === i ? "true" : undefined}
                className={`h-2.5 rounded-full shadow transition-all ${n === i ? "w-6 bg-white" : "w-2.5 bg-white/60"}`}
              >
                <span className="sr-only">Show banner {n + 1}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
