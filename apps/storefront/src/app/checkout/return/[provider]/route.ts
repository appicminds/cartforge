import type { NextRequest } from "next/server";
import { commerce } from "@/lib/commerce";

/**
 * Where payment providers send the shopper back (GET or form POST). Everything the
 * provider sent goes to the API, which verifies it; this route only decides where
 * the shopper goes next. Relative 303 redirects keep the public address and turn
 * a provider's POST into a normal page load.
 */
async function handle(req: NextRequest, provider: string): Promise<Response> {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    if (k !== "store" && k !== "sid") params[k] = v;
  });
  // The store travels in the address: a provider's cross-site POST carries no cookies.
  const sid = req.nextUrl.searchParams.get("sid");
  const storeId = sid && /^[0-9a-f-]{36}$/.test(sid) ? sid : undefined;
  if (req.method === "POST") {
    const type = req.headers.get("content-type") ?? "";
    if (
      type.includes("application/x-www-form-urlencoded") ||
      type.includes("multipart/form-data")
    ) {
      const form = await req.formData();
      form.forEach((v, k) => {
        if (typeof v === "string") params[k] = v;
      });
    }
  }
  const go = (path: string) =>
    new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });

  const r = await commerce.paymentReturn(provider, params, storeId);
  if (!r.ok)
    return go(`/checkout/payment-result?result=${r.status === 400 ? "unverified" : "error"}`);

  // Multi-step providers (Easypaisa): continue to their confirmation page.
  if (r.data.redirect) {
    const { url, fields } = r.data.redirect;
    const esc = (s: string) =>
      s.replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
      );
    const inputs = Object.entries(fields)
      .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
      .join("");
    return new Response(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>Confirming payment…</title></head><body><form id="f" method="post" action="${esc(url)}">${inputs}<p>Confirming your payment…</p><button type="submit">Continue</button></form><script>document.getElementById("f").submit()</script></body></html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      },
    );
  }

  // Next hop is a top-level GET, which does carry this browser's cookies (order key, preview).
  const q = new URLSearchParams({ outcome: r.data.outcome });
  if (r.data.order_id) q.set("order", r.data.order_id);
  return go(`/checkout/return/done?${q.toString()}`);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  return handle(req, (await params).provider);
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  return handle(req, (await params).provider);
}
