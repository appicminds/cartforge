import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/account/forms";
import { currentCustomer } from "@/lib/commerce";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = (await searchParams).next ?? "/account";
  if (await currentCustomer()) redirect("/account");
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl">Sign in</h1>
      <p className="mt-2 mb-6 text-muted">See your orders and check out faster.</p>
      <LoginForm next={next} />
      <p className="mt-6 text-sm">
        New here?{" "}
        <Link
          href={`/account/register?next=${encodeURIComponent(next)}`}
          className="underline underline-offset-2"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
