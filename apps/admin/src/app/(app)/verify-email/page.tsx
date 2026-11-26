import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@cartforge/ui";
import { AuthCard } from "@/components/auth-card";
import { VerifyEmail } from "./verify-email";

export const metadata: Metadata = {
  title: "Confirm your email",
  robots: { index: false },
  referrer: "no-referrer",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Confirm your email">
      {typeof token === "string" && token.length >= 20 ? (
        <VerifyEmail token={token} />
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <Alert tone="danger" title="This confirmation link is incomplete">
            Open the link from your email again, or send a new one from the admin.
          </Alert>
          <Link href="/admin" className="text-sm text-primary underline underline-offset-2">
            Go to the admin
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
