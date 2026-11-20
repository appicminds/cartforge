import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { secretMatches, tagsFrom } from "@/lib/revalidate";

/** Called by the API after catalog writes (PRD §8.8 #10). */
export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("x-revalidate-secret"), config.revalidateSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tags = tagsFrom(await req.json().catch(() => null));
  for (const tag of tags) revalidateTag(tag);
  return NextResponse.json({ revalidated: tags, at: new Date().toISOString() });
}
