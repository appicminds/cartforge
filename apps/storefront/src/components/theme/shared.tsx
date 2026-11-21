import type { SectionInstance } from "@cartforge/theme-engine";
import type { StorefrontProduct, StorefrontStore, ThemeImage } from "@cartforge/types";
import Link from "next/link";
import type { ReactNode } from "react";
import type { LoadedTheme } from "@/lib/theme";

export interface SectionCtx {
  store: StorefrontStore;
  theme: LoadedTheme;
  /** The first section on the page: eager images, and it carries the page's h1. */
  first: boolean;
  /** On product pages: the product (related products). */
  product?: StorefrontProduct;
}

export type S = Record<string, unknown>;
export const str = (s: S, k: string) => (typeof s[k] === "string" ? (s[k] as string) : "");
export const num = (s: S, k: string, d = 0) => (typeof s[k] === "number" ? (s[k] as number) : d);
export const bool = (s: S, k: string) => s[k] === true;

/** Static class names so Tailwind keeps them. */
export const LG_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
};
export const MD_COLS: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-3",
  5: "md:grid-cols-3",
};
export const ALIGN: Record<string, string> = {
  left: "text-left items-start",
  center: "text-center items-center",
  right: "text-right items-end",
};

/**
 * Every section is wrapped so the theme editor can find it (data-cf-*) and so
 * its color scheme applies to everything inside.
 */
export function Shell({
  section,
  children,
  as: Tag = "div",
  className = "",
  label,
}: {
  section: SectionInstance;
  children: ReactNode;
  as?: "div" | "section";
  className?: string;
  label?: string;
}) {
  const scheme = section.settings.color_scheme;
  return (
    <Tag
      data-cf-section={section.id}
      data-cf-type={section.type}
      aria-label={label}
      className={`${typeof scheme === "string" ? `sf-scheme-${scheme}` : ""} ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}

export function SectionHeading({
  title,
  href,
  linkLabel,
  id,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  id?: string;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <h2 id={id} className="text-2xl md:text-3xl">
        {title}
      </h2>
      {href && (
        <Link href={href} className="sf-link shrink-0 text-sm">
          {linkLabel ?? "View all"}
        </Link>
      )}
    </div>
  );
}

/** A theme image by media id; a soft placeholder when it's not set (or was deleted). */
export function ThemeImg({
  ctx,
  id,
  sizes,
  className = "",
  eager = false,
  alt = "",
}: {
  ctx: SectionCtx;
  id: unknown;
  sizes: string;
  className?: string;
  eager?: boolean;
  alt?: string;
}) {
  const img: ThemeImage | undefined = typeof id === "string" ? ctx.theme.images[id] : undefined;
  if (!img)
    return (
      <div
        aria-hidden
        className={`flex items-center justify-center bg-surface text-muted ${className}`}
      >
        <svg
          width="56"
          height="56"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M21 17l-5-5-9 8" />
        </svg>
      </div>
    );
  const srcSet = [
    img.medium_url && `${img.medium_url} 600w`,
    img.large_url && `${img.large_url} 1200w`,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <img
      src={img.large_url ?? img.url}
      srcSet={srcSet || undefined}
      sizes={sizes}
      alt={alt || img.alt || ""}
      width={img.width ?? undefined}
      height={img.height ?? undefined}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      className={className}
    />
  );
}

/** Merchant rich text: sanitized by the API against an allow-list when saved. */
export function RichText({ html, className = "" }: { html: string; className?: string }) {
  if (!html) return null;
  return <div className={`sf-prose ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Internal links use client navigation; https links open normally. */
export function ThemeLink({
  href,
  className,
  children,
  variant,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  variant?: "outline";
}) {
  if (href.startsWith("/"))
    return (
      <Link href={href} className={className} data-variant={variant}>
        {children}
      </Link>
    );
  return (
    <a href={href} className={className} data-variant={variant} rel="noopener noreferrer">
      {children}
    </a>
  );
}

export const HEADING_SIZE: Record<string, string> = {
  small: "text-2xl md:text-3xl",
  medium: "text-3xl md:text-5xl",
  large: "text-4xl leading-[1.05] md:text-6xl",
};
