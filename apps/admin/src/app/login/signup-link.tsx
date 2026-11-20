"use client";

import Link from "next/link";
import { usePlatformConfig } from "@/lib/platform";

/** Shown only when this installation allows public sign-up (SaaS edition). */
export function SignupLink() {
  const config = usePlatformConfig();
  if (!config.data?.signup_enabled) return null;
  return (
    <p className="mt-6 text-center text-sm text-fg-muted">
      New to CartForge?{" "}
      <Link href="/signup" className="font-medium text-primary underline underline-offset-2">
        Create your store
      </Link>
    </p>
  );
}
