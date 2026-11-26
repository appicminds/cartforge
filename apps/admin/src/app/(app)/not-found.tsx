import Link from "next/link";
import { Button, EmptyState } from "@cartforge/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <EmptyState
        title="Page not found"
        description="The page you're looking for doesn't exist or was moved."
        action={
          <Button asChild variant="secondary">
            <Link href="/admin">Back to admin</Link>
          </Button>
        }
      />
    </main>
  );
}
