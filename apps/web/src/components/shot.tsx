import Image from "next/image";

/** A product screenshot in a simple browser frame. Sizes are the file's real size. */
export function Shot({
  src,
  alt,
  width = 1600,
  height = 1000,
  address,
  priority = false,
  tone = "light",
  sizes = "(min-width: 1200px) 1100px, 100vw",
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  address?: string;
  priority?: boolean;
  tone?: "light" | "dark";
  sizes?: string;
}) {
  return (
    <figure
      className={`shot min-w-0 overflow-hidden border ${tone === "dark" ? "border-line-dark bg-ink-2" : "border-line bg-paper"}`}
    >
      <div
        aria-hidden
        className={`flex h-8 items-center gap-1.5 px-3 ${tone === "dark" ? "bg-ink-3" : "bg-paper-2"}`}
      >
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        {address && (
          <span
            className={`mx-auto truncate rounded-md px-3 py-0.5 text-[11px] ${tone === "dark" ? "bg-ink-2 text-fg-inverse-muted" : "bg-paper text-fg-muted"}`}
          >
            {address}
          </span>
        )}
      </div>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        sizes={sizes}
        className="block h-auto w-full"
      />
    </figure>
  );
}
