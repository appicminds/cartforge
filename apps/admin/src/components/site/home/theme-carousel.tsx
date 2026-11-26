"use client";

import Image from "next/image";
import { useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

const THEMES = [
  { key: "noor", name: "Noor", text: "Modest fashion in warm stone, black and soft gold." },
  { key: "bazaar", name: "Bazaar", text: "Bold fashion with a full-width slideshow." },
  { key: "minimal", name: "Minimal", text: "One typeface, lots of white space, pill buttons." },
  { key: "foundry", name: "Foundry", text: "Classic and calm, with serif headings." },
];

/** Large theme cards in a horizontal, snapping row. */
export function ThemeCarousel() {
  const row = useRef<HTMLUListElement>(null);
  const move = (dir: 1 | -1) =>
    row.current?.scrollBy({ left: dir * (row.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          aria-label="Previous themes"
          onClick={() => move(-1)}
          className="flex size-12 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10"
        >
          <ArrowLeft aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Next themes"
          onClick={() => move(1)}
          className="flex size-12 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10"
        >
          <ArrowRight aria-hidden className="size-5" />
        </button>
      </div>
      <ul
        ref={row}
        tabIndex={0}
        aria-label="Themes"
        className="-mx-5 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {THEMES.map((t) => (
          <li key={t.key} className="w-[82vw] shrink-0 snap-start sm:w-[560px] lg:w-[680px]">
            <Image
              src={`/site/themes/${t.key}.webp`}
              alt={`The ${t.name} theme's home page`}
              width={1600}
              height={1300}
              sizes="(min-width: 1024px) 680px, (min-width: 640px) 560px, 82vw"
              className="aspect-[16/11] w-full rounded-2xl object-cover object-top ring-1 ring-white/10"
            />
            <p className="mt-5 font-display text-2xl font-semibold text-white">{t.name}</p>
            <p className="mt-1 text-fg-inverse-muted">{t.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
