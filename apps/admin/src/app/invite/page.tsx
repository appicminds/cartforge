import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@cartforge/ui";
import { AuthCard } from "@/components/auth-card";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = {
  title: "Join a store",
  robots: { index: false },
  // The link carries a secret: don't leak it to other sites.
  referrer: "no-referrer",
};

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Join a store">
      {typeof token === "string" && token.length >= 20 ? (
        <AcceptInvite token={token} />
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <Alert tone="danger" title="This invitation link is incomplete">
            Open the link from your invitation again, or ask for a new one.
          </Alert>
          <Link href="/login" className="text-sm text-primary underline underline-offset-2">
            Go to sign in
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
