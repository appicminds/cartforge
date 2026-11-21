import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Payment", robots: { index: false, follow: false } };

const MESSAGES: Record<string, { title: string; body: string }> = {
  paid: {
    title: "Thank you — payment received",
    body: "Your order is confirmed. The link to follow it is in your confirmation email.",
  },
  pending: {
    title: "We're confirming your payment",
    body: "This can take a few minutes. We'll email you once it's confirmed.",
  },
  canceled: {
    title: "Payment not completed",
    body: "Your order is saved. Use the link in your confirmation email to pay when you're ready.",
  },
  failed: {
    title: "Payment didn't go through",
    body: "Your order is saved. Use the link in your confirmation email to try again.",
  },
  unverified: {
    title: "We couldn't confirm this payment",
    body: "If money left your account, contact the store with your order number and we'll sort it out.",
  },
  error: {
    title: "Something went wrong",
    body: "Your order is saved. Check your confirmation email, or contact the store.",
  },
};

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { result } = await searchParams;
  const m = MESSAGES[result ?? "error"] ?? MESSAGES.error!;
  return (
    <div className="sf-container max-w-xl py-16">
      <h1 className="text-3xl">{m.title}</h1>
      <p className="mt-2 text-muted">{m.body}</p>
      <Link href="/products" className="sf-button mt-8">
        Continue shopping
      </Link>
    </div>
  );
}
