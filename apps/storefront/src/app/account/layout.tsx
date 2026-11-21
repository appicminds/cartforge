import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <div className="sf-container max-w-3xl py-10 md:py-16">{children}</div>;
}
