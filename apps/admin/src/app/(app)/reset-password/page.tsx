import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@cartforge/ui";
import { AuthCard } from "@/components/auth-card";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false },
  // The link carries a secret: don't leak it to other sites.
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Choose a new password">
      {typeof token === "string" && token.length >= 20 ? (
        <ResetForm token={token} />
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <Alert tone="danger" title="This reset link is incomplete">
            Open the link from your email again, or ask for a new one.
          </Alert>
          <Link
            href="/forgot-password"
            className="text-sm text-primary underline underline-offset-2"
          >
            Get a new link
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
