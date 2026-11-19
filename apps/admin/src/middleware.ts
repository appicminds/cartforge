import { NextResponse, type NextRequest } from "next/server";
import { COOKIES } from "@cartforge/types";

/**
 * Coarse route guard (FE-002): no session cookie → login. This is a UX
 * shortcut only; the API validates the session on every request and the admin
 * layout redirects on 401, so a stale cookie never renders protected data.
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get(COOKIES.SESSION)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
