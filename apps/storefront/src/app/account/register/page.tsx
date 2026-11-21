import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/account/forms";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = (await searchParams).next ?? "/account";
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl">Create an account</h1>
      <p className="mt-2 mb-6 text-muted">Track your orders and save your addresses.</p>
      <RegisterForm next={next} />
      <p className="mt-6 text-sm">
        Already have an account?{" "}
        <Link href="/account/login" className="underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}
