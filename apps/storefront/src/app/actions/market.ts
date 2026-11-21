"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { MARKET_COOKIE, storefront } from "@/lib/api";
import { cartToken, commerce } from "@/lib/commerce";

/** Only same-site paths: "/products/x?y" — never another host. */
function backTo(referer: string | null): string {
  if (!referer) return "/";
  try {
    const u = new URL(referer);
    return u.pathname.startsWith("/") && !u.pathname.startsWith("//") ? u.pathname + u.search : "/";
  } catch {
    return "/";
  }
}

/** Country / currency selector: remember the market and re-price an open cart. */
export async function chooseMarket(fd: FormData): Promise<void> {
  const id = String(fd.get("market") ?? "");
  const markets = await storefront.markets();
  if (markets.some((m) => m.id === id)) {
    (await cookies()).set(MARKET_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    const token = await cartToken();
    if (token) await commerce.setCartMarket(token, id);
  }
  redirect(backTo((await headers()).get("referer")));
}
