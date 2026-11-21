import type { Metadata } from "next";
import { ForgotForm } from "@/components/account/forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-3xl">Reset your password</h1>
      <p className="mt-2 mb-6 text-muted">We&apos;ll email you a link to choose a new one.</p>
      <ForgotForm />
    </div>
  );
}
