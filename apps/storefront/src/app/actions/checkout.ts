"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cartToken,
  commerce,
  forgetCart,
  type ApiFailure,
  LAST_ORDER_COOKIE,
} from "@/lib/commerce";
import type { AddressInput, CheckoutUpdateInput, FormState } from "@/lib/commerce-types";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

function address(fd: FormData, prefix: string): AddressInput {
  const f = (k: string) => str(fd, `${prefix}.${k}`) || null;
  return {
    first_name: f("first_name"),
    last_name: str(fd, `${prefix}.last_name`),
    company: f("company"),
    address1: str(fd, `${prefix}.address1`),
    address2: f("address2"),
    city: str(fd, `${prefix}.city`),
    region: f("region"),
    postal_code: f("postal_code"),
    country: str(fd, `${prefix}.country`),
    phone: f("phone"),
  };
}

function failure(r: ApiFailure): FormState {
  if (r.code === "CART_NOT_FOUND" || r.code === "CHECKOUT_COMPLETED") redirect("/cart");
  const errors: Record<string, string> = {};
  for (const f of r.fields) errors[f.path] ??= f.message;
  return { message: r.fields.length ? "Please check the highlighted fields." : r.message, errors };
}

async function patch(body: CheckoutUpdateInput): Promise<FormState | null> {
  const token = await cartToken();
  if (!token) redirect("/cart");
  const r = await commerce.updateCheckout(token, body);
  return r.ok ? null : failure(r);
}

/** Step 1: contact + shipping address (or billing address for orders that don't ship). */
export async function saveInformation(_prev: FormState, fd: FormData): Promise<FormState> {
  const ships = fd.get("ships") === "1";
  const body: CheckoutUpdateInput = { email: str(fd, "email") };
  if (fd.has("phone")) body.phone = str(fd, "phone") || null;
  if (ships) body.shipping_address = address(fd, "shipping_address");
  else {
    body.billing_same_as_shipping = false;
    body.billing_address = address(fd, "billing_address");
  }
  const err = await patch(body);
  if (err) return err;
  redirect(ships ? "/checkout?step=shipping" : "/checkout?step=payment");
}

/** Step 2: shipping method. */
export async function saveShipping(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "shipping_method_id");
  if (!id)
    return {
      message: "Choose a shipping method.",
      errors: { shipping_method_id: "Choose a shipping method." },
    };
  const err = await patch({ shipping_method_id: id });
  if (err) return err;
  redirect("/checkout?step=payment");
}

/** Discount code in the order summary: apply it, or remove it with an empty code. */
export async function applyDiscount(_prev: FormState, fd: FormData): Promise<FormState> {
  const code = str(fd, "discount_code").toUpperCase();
  if (fd.get("remove") !== "1" && !code)
    return { errors: { discount_code: "Enter a discount code." } };
  const err = await patch({ discount_code: fd.get("remove") === "1" ? null : code });
  if (err)
    return { errors: err.errors, message: err.errors?.discount_code ? undefined : err.message };
  revalidatePath("/checkout");
  return { done: true };
}

/** Step 3: payment, billing, custom fields, terms — then place the order. */
export async function placeOrder(_prev: FormState, fd: FormData): Promise<FormState> {
  const token = await cartToken();
  if (!token) redirect("/cart");
  const body: CheckoutUpdateInput = {
    payment_method: str(fd, "payment_method") || null,
    terms_accepted: fd.get("terms") === "on",
  };
  if (fd.get("ships") === "1") {
    const same = fd.get("billing") !== "different";
    body.billing_same_as_shipping = same;
    if (!same) body.billing_address = address(fd, "billing_address");
  }
  const custom: Record<string, string | boolean> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("custom.") && typeof v === "string") custom[k.slice(7)] = v;
  }
  for (const k of String(fd.get("custom_checkboxes") ?? "")
    .split(",")
    .filter(Boolean))
    custom[k] = fd.get(`custom.${k}`) === "on";
  if (Object.keys(custom).length || fd.has("custom_checkboxes")) body.custom_fields = custom;

  const err = await patch(body);
  if (err) return err;

  const key = str(fd, "idempotency_key");
  const expected = Number.parseInt(str(fd, "expected_total"), 10);
  const r = await commerce.complete(token, key, Number.isFinite(expected) ? expected : 0);
  if (!r.ok) {
    revalidatePath("/checkout"); // show the current totals
    if (r.code === "CHECKOUT_CHANGED")
      return { message: "Your order total changed. Please review it and place your order again." };
    return failure(r);
  }
  await forgetCart();
  const target = `${r.data.order_id}?key=${encodeURIComponent(r.data.access_key)}`;
  // Online payment: keep the key in this browser for the return trip, then go pay.
  (await cookies()).set(LAST_ORDER_COOKIE, `${r.data.order_id}.${r.data.access_key}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 24 * 60 * 60,
  });
  redirect(r.data.pay_online ? `/checkout/pay/${target}` : `/orders/${target}`);
}
