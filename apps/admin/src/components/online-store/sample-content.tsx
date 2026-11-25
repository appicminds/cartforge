"use client";

import Link from "next/link";
import { useState } from "react";
import { PackagePlus } from "lucide-react";
import type { ThemeSummary } from "@cartforge/types";
import { Alert, Button, Dialog, useToast } from "@cartforge/ui";
import { useSampleContent, useSampleContentStep } from "@/lib/online-store";

/**
 * "Add sample products" for themes that come with their own sample catalog:
 * collections, products with pictures, and banner pictures for the theme.
 * The server works in short steps, so this keeps asking until it's done.
 */
export function SampleContentButton({ theme }: { theme: ThemeSummary }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = useSampleContent(theme.id, open);
  const step = useSampleContentStep(theme.id);
  const progress = step.data ?? status.data;
  const done = progress?.done ?? false;

  const start = async () => {
    setRunning(true);
    setError(null);
    try {
      for (let i = 0; i < 20; i++) {
        const p = await step.mutateAsync();
        if (p.done) {
          toast.success(`Sample products added to your store`);
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setRunning(false);
    }
  };

  const pct = progress
    ? Math.round((progress.products_added / Math.max(1, progress.products_total)) * 100)
    : 0;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <PackagePlus aria-hidden /> Add sample products
      </Button>
      <Dialog
        open={open}
        onClose={() => !running && setOpen(false)}
        title={`Sample products for ${theme.name}`}
        description="See the theme with a full catalog before you add your own."
        footer={
          done ? (
            <>
              <Button variant="secondary" asChild>
                <Link href="/admin/products">View products</Link>
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" disabled={running} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={running || status.isLoading} onClick={start}>
                {running ? "Adding…" : "Add sample products"}
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-4 text-sm">
          {progress && (
            <ul className="list-disc space-y-1 pl-5">
              <li>
                {progress.products_total} products with pictures, sizes and prices in your
                store&apos;s currency
              </li>
              <li>{progress.collections_total} collections, such as Best sellers and New in</li>
              <li>Banner pictures for the theme&apos;s slideshow and story section</li>
            </ul>
          )}
          <p className="text-fg-muted">
            They&apos;re published right away and tagged <strong>sample</strong>, so you can find
            and delete them later. Anything already in your store with the same name is left as it
            is.
          </p>
          {(running || (progress && progress.products_added > 0)) && (
            <div className="flex flex-col gap-2" role="status" aria-live="polite">
              <div
                className="h-2 overflow-hidden rounded-full bg-surface-sunken"
                role="progressbar"
                aria-label="Sample products added"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p>
                {done
                  ? `All ${progress?.products_total} sample products are in your store.`
                  : `${progress?.products_added ?? 0} of ${progress?.products_total ?? "…"} products added${running ? "…" : ""}`}
              </p>
            </div>
          )}
          {error && (
            <Alert tone="danger" title="Couldn't finish adding sample products">
              {error} What's been added so far is kept; try again to continue.
            </Alert>
          )}
        </div>
      </Dialog>
    </>
  );
}
