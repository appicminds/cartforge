/** Icons for "Icons with text", product tabs and social links (stroke icons, 24×24). */
const PATHS: Record<string, string> = {
  truck: "M3 6h11v9H3zM14 9h4l3 3v3h-7M6.5 18.5a1.5 1.5 0 1 0 0-.01M17.5 18.5a1.5 1.5 0 1 0 0-.01",
  cash: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M6 10v4M18 10v4",
  card: "M3 6h18v12H3zM3 10h18M7 15h4",
  return: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-4",
  shield: "M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6zM9 12l2 2 4-4",
  chat: "M4 5h16v11H8l-4 4z",
  phone:
    "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1",
  gift: "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5-1s5 1 5 1 4 1 5-1-3-3-5 1",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10",
  leaf: "M5 19C5 10 10 5 20 4c0 9-5 15-13 15M5 19l7-7",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2",
  check: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M8 12l3 3 5-6",
  tag: "M3 12V4h8l10 10-8 8zM7.5 7.5h.01",
  sparkle: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 3v4M17 5h4",
};

export function Icon({ name, className = "h-6 w-6" }: { name: string; className?: string }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

/** Brand marks for social links (filled, simplified). */
const SOCIAL: Record<string, { label: string; d: string }> = {
  social_instagram: {
    label: "Instagram",
    d: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4m5 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8m5.5-1.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2",
  },
  social_facebook: { label: "Facebook", d: "M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8" },
  social_tiktok: {
    label: "TikTok",
    d: "M14 3v11a3 3 0 1 1-3-3V7a7 7 0 1 0 7 7V8.5a6 6 0 0 0 3 1V6a4 4 0 0 1-4-3z",
  },
  social_youtube: {
    label: "YouTube",
    d: "M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zm7 1v6l5-3z",
  },
  social_x: {
    label: "X",
    d: "M4 4h4l4 5.5L16.5 4H20l-6.2 7.3L20 20h-4l-4.3-5.8L6.8 20H3.4l6.6-7.6z",
  },
  social_whatsapp: {
    label: "WhatsApp",
    d: "M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3m4.5 12.4c-.2.5-1.1 1-1.6 1-.4.1-.9.1-1.5-.1a12 12 0 0 1-5.6-4.9c-.4-.6-.7-1.5-.7-2.2a2.5 2.5 0 0 1 .8-1.8c.2-.2.4-.3.6-.3h.4c.2 0 .3 0 .5.4l.7 1.6c0 .2 0 .3-.1.5l-.5.6c-.1.1-.2.3-.1.5a7 7 0 0 0 3.4 3c.2.1.4 0 .5-.1l.6-.8c.2-.2.3-.2.5-.1l1.6.8c.2.1.4.2.4.3 0 .2 0 .9-.3 1.5",
  },
};

export function SocialLinks({ settings }: { settings: Record<string, unknown> }) {
  const links = Object.entries(SOCIAL)
    .map(([id, s]) => ({ ...s, url: settings[id] }))
    .filter((s): s is typeof s & { url: string } => typeof s.url === "string" && s.url !== "");
  if (!links.length) return null;
  return (
    <ul className="flex flex-wrap gap-3" aria-label="Social media">
      {links.map((s) => (
        <li key={s.label}>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line hover:border-ink"
          >
            <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d={s.d} />
            </svg>
            <span className="sr-only">{s.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
