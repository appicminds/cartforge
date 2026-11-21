import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "@/components/account/forms";

export const metadata: Metadata = { title: "Choose a password", referrer: "no-referrer" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl">Choose a password</h1>
      {token && token.length >= 20 ? (
        <div className="mt-6">
          <ResetForm token={token} />
        </div>
      ) : (
        <p className="mt-4">
          This link is incomplete.{" "}
          <Link href="/account/forgot" className="underline underline-offset-2">
            Get a new link
          </Link>
        </p>
      )}
    </div>
  );
}
