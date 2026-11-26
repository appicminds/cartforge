import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { SignupLink } from "./signup-link";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-fg"
          >
            C
          </span>
          <span className="text-xl font-semibold tracking-tight">CartForge</span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-md sm:p-8">
          <h1 className="text-xl font-semibold">Sign in to your store</h1>
          <p className="mt-1 text-sm text-fg-muted">Use your account to manage your stores.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <SignupLink />
      </div>
    </main>
  );
}
