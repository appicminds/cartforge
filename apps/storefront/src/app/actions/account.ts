"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  account,
  customerToken,
  forgetCustomer,
  rememberCustomer,
  type ApiFailure,
} from "@/lib/commerce";
import type { FormState } from "@/lib/commerce-types";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const orNull = (v: string) => v || null;

/** API field errors onto the form (address.* is shown on the address block's fields). */
function failure(r: ApiFailure): FormState {
  const errors: Record<string, string> = {};
  for (const f of r.fields) errors[f.path.replace(/^address\./, "shipping_address.")] ??= f.message;
  return { message: r.fields.length ? "Please check the highlighted fields." : r.message, errors };
}

/** Only same-site paths after signing in. */
const safeNext = (v: string) => (/^\/(?!\/)[\w\-/?=&%.]*$/.test(v) ? v : "/account");

async function signedIn(): Promise<string> {
  const token = await customerToken();
  if (!token) redirect("/account/login");
  return token;
}

export async function register(_: FormState, fd: FormData): Promise<FormState> {
  const r = await account.register({
    email: str(fd, "email"),
    password: String(fd.get("password") ?? ""),
    first_name: orNull(str(fd, "first_name")),
    last_name: orNull(str(fd, "last_name")),
    accepts_marketing: fd.get("accepts_marketing") === "on",
  });
  if (!r.ok) return failure(r);
  if (r.data.link_sent || !r.data.token)
    return {
      message:
        "You've ordered here before. We've emailed you a link to finish creating your account, so your past orders stay private.",
      done: true,
    };
  await rememberCustomer(r.data.token);
  redirect(safeNext(str(fd, "next")));
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const r = await account.login(str(fd, "email"), String(fd.get("password") ?? ""));
  if (!r.ok) return failure(r);
  await rememberCustomer(r.data.token);
  redirect(safeNext(str(fd, "next")));
}

export async function logout(): Promise<void> {
  const token = await customerToken();
  if (token) await account.logout(token);
  await forgetCustomer();
  redirect("/");
}

export async function forgot(_: FormState, fd: FormData): Promise<FormState> {
  const r = await account.forgot(str(fd, "email"));
  if (!r.ok) return failure(r);
  return {
    message: "If you have an account or have ordered here, a link is on its way to your email.",
    done: true,
  };
}

export async function resetPassword(_: FormState, fd: FormData): Promise<FormState> {
  const r = await account.reset(str(fd, "token"), String(fd.get("password") ?? ""));
  if (!r.ok) return failure(r);
  await rememberCustomer(r.data.token);
  redirect("/account");
}

export async function updateProfile(_: FormState, fd: FormData): Promise<FormState> {
  const r = await account.update(await signedIn(), {
    first_name: orNull(str(fd, "first_name")),
    last_name: orNull(str(fd, "last_name")),
    phone: orNull(str(fd, "phone")),
    accepts_marketing: fd.get("accepts_marketing") === "on",
  });
  if (!r.ok) return failure(r);
  revalidatePath("/account");
  return { message: "Saved.", done: true };
}

export async function saveAddress(_: FormState, fd: FormData): Promise<FormState> {
  const f = (k: string) => str(fd, `shipping_address.${k}`);
  const id = str(fd, "id") || undefined;
  const r = await account.saveAddress(
    await signedIn(),
    {
      address: {
        first_name: orNull(f("first_name")),
        last_name: f("last_name"),
        company: orNull(f("company")),
        address1: f("address1"),
        address2: orNull(f("address2")),
        city: f("city"),
        region: orNull(f("region")),
        postal_code: orNull(f("postal_code")),
        country: f("country"),
        phone: orNull(f("phone")),
      },
      is_default: fd.get("is_default") === "on",
    },
    id,
  );
  if (!r.ok) return failure(r);
  redirect("/account");
}

export async function deleteAddress(fd: FormData): Promise<void> {
  await account.deleteAddress(await signedIn(), str(fd, "id"));
  revalidatePath("/account");
}
