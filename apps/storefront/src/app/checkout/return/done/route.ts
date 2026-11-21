import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { LAST_ORDER_COOKIE } from "@/lib/commerce";

/** After a verified return: send the shopper to their order page if this browser has its key. */
export async function GET(req: NextRequest): Promise<Response> {
  const order = req.nextUrl.searchParams.get("order") ?? "";
  const outcome = req.nextUrl.searchParams.get("outcome") ?? "pending";
  const [id, key] = ((await cookies()).get(LAST_ORDER_COOKIE)?.value ?? "").split(".");
  const to =
    order && id === order && key
      ? `/orders/${id}?key=${encodeURIComponent(key)}&payment=${encodeURIComponent(outcome)}`
      : `/checkout/payment-result?result=${encodeURIComponent(outcome)}`;
  return new Response(null, {
    status: 303,
    headers: { Location: to, "Cache-Control": "no-store" },
  });
}
