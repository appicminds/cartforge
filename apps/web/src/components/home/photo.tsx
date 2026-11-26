import Image from "next/image";
import type { Photo } from "@/lib/photos";

/**
 * A photograph filling its box, or (until a photo is added) a warm, designed
 * gradient so the layout still reads as finished.
 */
export function PhotoFill({
  photo,
  sizes = "100vw",
  priority = false,
  className = "",
}: {
  photo: Photo;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  if (photo.src)
    return (
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes={sizes}
        priority={priority}
        className={`object-cover ${className}`}
      />
    );
  return (
    <div
      aria-hidden
      className={`absolute inset-0 ${className}`}
      style={{
        background:
          "radial-gradient(80% 70% at 20% 20%, #f6c9a8 0%, transparent 60%), radial-gradient(70% 70% at 85% 80%, #c2410c 0%, transparent 65%), linear-gradient(135deg, #3b2416, #111214)",
      }}
    />
  );
}
