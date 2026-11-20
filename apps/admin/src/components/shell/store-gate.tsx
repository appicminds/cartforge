"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Spinner } from "@cartforge/ui";
import { useSession } from "@/lib/session";

/** Pages that work without an open store. */
const STORELESS = ["/admin/stores", "/admin/platform"];

/**
 * Shopify-style: the admin always works inside one chosen store. Without one,
 * send the user to "Your stores" (or platform admins to the platform pages).
 */
export function StoreGate({ children }: { children: ReactNode }) {
  const { store, ready, user } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = STORELESS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const needsPick = ready && !store && !allowed;

  useEffect(() => {
    if (!needsPick) return;
    const onlyPlatform = user.is_platform_admin && user.stores.length === 0;
    router.replace(onlyPlatform ? "/admin/platform/stores" : "/admin/stores");
  }, [needsPick, user, router]);

  if (!ready || needsPick) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="size-6 text-fg-muted" label="Opening your store" />
      </div>
    );
  }
  return <>{children}</>;
}
