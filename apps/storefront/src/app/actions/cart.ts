"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cartToken,
  commerce,
  forgetCart,
  rememberCart,
  setCount,
  type ApiFailure,
} from "@/lib/commerce";
import type { CartNotice } from "@/lib/commerce-types";

export interface AddResult {
  ok: boolean;
  message: string;
  count: number;
  notices: CartNotice[];
}

const qty = (v: unknown, fallback = 1) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? Math.min(99, Math.max(0, n)) : fallback;
};

/** Adds a variant, creating the cart on first use (or after it expired). */
export async function addToCart(variantId: string, quantity: number): Promise<AddResult> {
  let token = await cartToken();
  let res = token ? await commerce.addLine(token, variantId, Math.max(1, qty(quantity))) : null;
  if (!token || (res && !res.ok && res.code === "CART_NOT_FOUND")) {
    const created = await commerce.createCart();
    if (!created.ok) return { ok: false, message: created.message, count: 0, notices: [] };
    token = created.data.token;
    res = await commerce.addLine(token, variantId, Math.max(1, qty(quantity)));
  }
  if (!res!.ok) {
    const f = res as ApiFailure;
    return { ok: false, message: f.message, count: 0, notices: [] };
  }
  const cart = res!.data;
  await rememberCart(token!, cart.item_count);
  revalidatePath("/cart");
  const reduced = cart.notices.find((n) => n.kind === "quantity_reduced" && n.line_id === null);
  return {
    ok: true,
    message: reduced?.message ?? "Added to your cart.",
    count: cart.item_count,
    notices: cart.notices,
  };
}

export async function updateLine(formData: FormData): Promise<void> {
  const token = await cartToken();
  const id = String(formData.get("line_id") ?? "");
  if (!token || !id) redirect("/cart");
  const r = await commerce.updateLine(token, id, qty(formData.get("quantity"), 1));
  if (r.ok) await setCount(r.data.item_count);
  else if (r.code === "CART_NOT_FOUND") await forgetCart();
  revalidatePath("/cart");
}

export async function removeLine(formData: FormData): Promise<void> {
  const token = await cartToken();
  const id = String(formData.get("line_id") ?? "");
  if (!token || !id) redirect("/cart");
  const r = await commerce.removeLine(token, id);
  if (r.ok) await setCount(r.data.item_count);
  else if (r.code === "CART_NOT_FOUND") await forgetCart();
  revalidatePath("/cart");
}

/** "Check out" from the cart page. */
export async function startCheckout(): Promise<void> {
  const token = await cartToken();
  if (!token) redirect("/cart");
  const r = await commerce.openCheckout(token);
  if (!r.ok) redirect(`/cart?error=${encodeURIComponent(r.message)}`);
  redirect("/checkout");
}
