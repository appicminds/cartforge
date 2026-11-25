/** YouTube and Vimeo addresses. */
const VIDEO = [
  /^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})/i,
  /^https:\/\/youtu\.be\/([\w-]{11})/i,
  /^https:\/\/(?:www\.)?youtube\.com\/(?:shorts|embed)\/([\w-]{11})/i,
  /^https:\/\/(?:www\.)?vimeo\.com\/(\d{6,12})/i,
];

/** { provider, id } for a YouTube / Vimeo address, else null. */
export function parseVideo(url: string): { provider: "youtube" | "vimeo"; id: string } | null {
  for (const [i, re] of VIDEO.entries()) {
    const m = re.exec(url.trim());
    if (m) return { provider: i === 3 ? "vimeo" : "youtube", id: m[1]! };
  }
  return null;
}
