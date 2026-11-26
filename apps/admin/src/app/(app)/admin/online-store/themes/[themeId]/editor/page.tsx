"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Alert, Button, Skeleton } from "@cartforge/ui";
import { ThemeEditor } from "@/components/online-store/editor/editor";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";
import { useTheme } from "@/lib/online-store";

/** Online store → Themes → Customize (full screen). */
export default function ThemeEditorPage() {
  const { themeId } = useParams<{ themeId: string }>();
  const theme = useTheme(themeId);
  useBreadcrumbTitle(theme.data ? `Customize ${theme.data.name}` : "Customize");
  if (theme.isError)
    return (
      <Alert
        tone="danger"
        title="Couldn't open the theme"
        action={
          <Button asChild variant="secondary">
            <Link href="/admin/online-store">Back to themes</Link>
          </Button>
        }
      >
        {theme.error.message}
      </Alert>
    );
  if (!theme.data) return <Skeleton className="h-96 w-full" />;
  // Remount on reload (publish, restore) so the editor starts from the saved theme.
  return (
    <ThemeEditor
      key={`${theme.data.id}-${theme.dataUpdatedAt}`}
      theme={theme.data}
      onReload={async () => void (await theme.refetch())}
    />
  );
}
