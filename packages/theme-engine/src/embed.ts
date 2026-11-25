import { parseVideo } from "./video";

/**
 * Embeds from known providers only. A pasted link (not embed code) is turned
 * into the provider's own embed address; anything else is refused, so a
 * section can never load an arbitrary page or script.
 */
export interface Embed {
  provider: string;
  label: string;
  src: string;
  /** CSS aspect ratio, or a fixed height in px for feeds and forms. */
  aspect?: string;
  height?: number;
}

export const EMBED_PROVIDERS = [
  "YouTube",
  "Vimeo",
  "Google Maps",
  "Instagram",
  "TikTok",
  "Facebook",
  "Google Forms",
  "Typeform",
  "Spotify",
  "SoundCloud",
];

const enc = encodeURIComponent;

/** The embed for a link, or null when it isn't from a supported provider. */
export function parseEmbed(raw: string): Embed | null {
  const url = raw.trim();
  if (!/^https:\/\//i.test(url) || url.length > 1000 || /["'<>\s]/.test(url)) return null;
  const video = parseVideo(url);
  if (video)
    return video.provider === "youtube"
      ? {
          provider: "youtube",
          label: "YouTube",
          src: `https://www.youtube-nocookie.com/embed/${video.id}?rel=0`,
          aspect: "16 / 9",
        }
      : {
          provider: "vimeo",
          label: "Vimeo",
          src: `https://player.vimeo.com/video/${video.id}?dnt=1`,
          aspect: "16 / 9",
        };

  let m: RegExpExecArray | null;
  // Google Maps: the "Embed a map" address, or a place link.
  if (/^https:\/\/(www\.)?google\.[a-z.]+\/maps\/embed\?[\w=&%.:,+!*-]+$/i.test(url))
    return { provider: "maps", label: "Google Maps", src: url, height: 450 };
  if ((m = /^https:\/\/(?:www\.)?google\.[a-z.]+\/maps\/(?:place|search)\/([^/?#]+)/i.exec(url)))
    return {
      provider: "maps",
      label: "Google Maps",
      src: `https://maps.google.com/maps?q=${enc(decodeURIComponent(m[1]!).replace(/\+/g, " "))}&output=embed`,
      height: 450,
    };
  if ((m = /^https:\/\/(?:www\.)?instagram\.com\/(p|reel|tv)\/([\w-]{5,40})\/?/i.exec(url)))
    return {
      provider: "instagram",
      label: "Instagram",
      src: `https://www.instagram.com/${m[1]!.toLowerCase()}/${m[2]}/embed`,
      height: 640,
    };
  if ((m = /^https:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/(\d{8,25})/i.exec(url)))
    return {
      provider: "tiktok",
      label: "TikTok",
      src: `https://www.tiktok.com/embed/v2/${m[1]}`,
      height: 740,
    };
  if (/^https:\/\/(?:www\.|m\.)?facebook\.com\/[\w.-]+\/(posts|videos)\/[\w.-]+/i.test(url))
    return {
      provider: "facebook",
      label: "Facebook",
      src: `https://www.facebook.com/plugins/${/\/videos\//.test(url) ? "video" : "post"}.php?href=${enc(url)}&show_text=true`,
      height: 600,
    };
  if (/^https:\/\/(?:www\.|m\.)?facebook\.com\/[\w.-]+\/?$/i.test(url))
    return {
      provider: "facebook",
      label: "Facebook",
      src: `https://www.facebook.com/plugins/page.php?href=${enc(url)}&tabs=timeline&width=500&height=600`,
      height: 600,
    };
  if ((m = /^https:\/\/docs\.google\.com\/forms\/d\/e\/([\w-]{20,})\/viewform/i.exec(url)))
    return {
      provider: "google_forms",
      label: "Google Forms",
      src: `https://docs.google.com/forms/d/e/${m[1]}/viewform?embedded=true`,
      height: 800,
    };
  if ((m = /^https:\/\/([\w-]+)\.typeform\.com\/to\/([\w-]{4,40})/i.exec(url)))
    return {
      provider: "typeform",
      label: "Typeform",
      src: `https://${m[1]}.typeform.com/to/${m[2]}`,
      height: 560,
    };
  if (
    (m =
      /^https:\/\/open\.spotify\.com\/(track|album|playlist|episode|show|artist)\/([\w]{10,40})/i.exec(
        url,
      ))
  )
    return {
      provider: "spotify",
      label: "Spotify",
      src: `https://open.spotify.com/embed/${m[1]!.toLowerCase()}/${m[2]}`,
      height: m[1]!.toLowerCase() === "track" || m[1]!.toLowerCase() === "episode" ? 152 : 380,
    };
  if (/^https:\/\/(?:www\.)?soundcloud\.com\/[\w-]+\/[\w-]+/i.test(url))
    return {
      provider: "soundcloud",
      label: "SoundCloud",
      src: `https://w.soundcloud.com/player/?url=${enc(url)}`,
      height: 166,
    };
  return null;
}
