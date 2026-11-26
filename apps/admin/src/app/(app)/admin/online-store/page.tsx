"use client";

import Link from "next/link";
import { useState } from "react";
import { MoreHorizontal, Paintbrush, Plus } from "lucide-react";
import { PERMISSIONS, type ThemeSummary } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Dialog,
  Field,
  Input,
  Menu,
  PageHeader,
  Skeleton,
  useToast,
} from "@cartforge/ui";
import { OnlineStoreTabs } from "@/components/online-store/tabs";
import { ThemeThumbnail } from "@/components/online-store/theme-thumbnail";
import { SampleContentButton } from "@/components/online-store/sample-content";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";
import { formatDateTime } from "@/lib/format";
import {
  storefrontUrl,
  useStorefrontBase,
  useThemeAction,
  useThemePresets,
  useThemePreviewLink,
  useThemes,
} from "@/lib/online-store";
import { useSession } from "@/lib/session";

/** Online store → Themes: the live theme, the library, and ready-made themes. */
export default function ThemesPage() {
  useBreadcrumbTitle(null);
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.THEMES_WRITE);
  const canAddSamples =
    canEdit &&
    can(PERMISSIONS.PRODUCTS_WRITE) &&
    can(PERMISSIONS.PRODUCTS_PUBLISH) &&
    can(PERMISSIONS.COLLECTIONS_WRITE) &&
    can(PERMISSIONS.MEDIA_WRITE);
  const toast = useToast();
  const themes = useThemes();
  const presets = useThemePresets();
  const action = useThemeAction();
  const previewLink = useThemePreviewLink();
  const base = useStorefrontBase();
  const [renaming, setRenaming] = useState<ThemeSummary | null>(null);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<ThemeSummary | null>(null);
  const [publishing, setPublishing] = useState<ThemeSummary | null>(null);

  const live = themes.data?.find((t) => t.role === "live");
  const samples = (t: ThemeSummary) =>
    canAddSamples &&
    presets.data?.some((p) => p.key === t.preset && p.has_sample_content) && (
      <SampleContentButton theme={t} />
    );
  const others = themes.data?.filter((t) => t.role !== "live") ?? [];

  const preview = (t: ThemeSummary) => {
    if (!base) return toast.error("This store has no storefront address yet.");
    const win = window.open("about:blank", "_blank");
    previewLink.mutate(t.id, {
      onSuccess: (l) => {
        const url = storefrontUrl(base, "/", { theme_preview: l.token });
        if (win) win.location.href = url;
        else window.location.href = url;
      },
      onError: (e) => {
        win?.close();
        toast.error(e.message);
      },
    });
  };
  const run = (a: Parameters<typeof action.mutate>[0], done: string) =>
    action.mutate(a, {
      onSuccess: () => toast.success(done),
      onError: (e) => toast.error(e.message),
    });

  const actions = (t: ThemeSummary) => (
    <Menu
      label={`More actions for ${t.name}`}
      trigger={<MoreHorizontal aria-hidden className="size-4" />}
      triggerClassName="h-9 w-9 justify-center rounded-md border border-border-strong bg-surface"
      items={[
        { label: "Preview", onSelect: () => preview(t) },
        ...(canEdit
          ? [
              { label: "Rename", onSelect: () => (setRenaming(t), setName(t.name)) },
              {
                label: "Duplicate",
                onSelect: () => run({ kind: "duplicate", id: t.id }, "Theme duplicated"),
              },
              ...(t.role !== "live"
                ? [{ label: "Delete", onSelect: () => setDeleting(t), destructive: true }]
                : []),
            ]
          : []),
      ]}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Online store"
        description="Choose how your store looks. Customize a theme, preview it, then publish when it's ready."
      />
      <OnlineStoreTabs />
      {themes.isError && (
        <Alert tone="danger" title="Couldn't load themes">
          {themes.error.message}
        </Alert>
      )}

      <Card>
        <CardHeader title="Current theme" description="What shoppers see now." />
        <CardBody>
          {!live ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <ThemeThumbnail
                preset={live.preset}
                url={live.thumbnail_url}
                className="aspect-[16/10] w-full sm:w-64"
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                  {live.name} <Badge tone="success">Live</Badge>
                  {live.has_unpublished_changes && (
                    <Badge tone="warning">Unpublished changes</Badge>
                  )}
                </p>
                <p className="text-sm text-fg-muted">
                  {live.published_at
                    ? `Published ${formatDateTime(live.published_at)}`
                    : "Not published yet"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {actions(live)}
                {samples(live)}
                {canEdit && (
                  <Button asChild>
                    <Link href={`/admin/online-store/themes/${live.id}/editor`}>
                      <Paintbrush aria-hidden /> Customize
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Theme library"
          description="Work on another look without changing your store. Publish it when it's ready."
        />
        {others.length === 0 ? (
          <CardBody className="text-sm text-fg-muted">No other themes yet. Add one below.</CardBody>
        ) : (
          <ul className="divide-y divide-border">
            {others.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <ThemeThumbnail
                  preset={t.preset}
                  url={t.thumbnail_url}
                  className="aspect-[16/10] w-full sm:w-40"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-fg-muted">Last saved {formatDateTime(t.updated_at)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {actions(t)}
                  {samples(t)}
                  {canEdit && (
                    <>
                      <Button variant="secondary" onClick={() => setPublishing(t)}>
                        Publish
                      </Button>
                      <Button asChild variant="secondary">
                        <Link href={`/admin/online-store/themes/${t.id}/editor`}>Customize</Link>
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {canEdit && (
        <Card>
          <CardHeader
            title="Add a theme"
            description="Start from a ready-made look. It's added to your library; your store doesn't change until you publish."
          />
          <CardBody>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {(presets.data ?? []).map((p) => (
                <li key={p.key} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  <ThemeThumbnail preset={p.key} className="aspect-[16/10] w-full" />
                  <div className="flex-1">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-fg-muted">{p.description}</p>
                    {p.has_sample_content && (
                      <p className="mt-1 text-sm text-fg-muted">Includes sample products.</p>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    disabled={action.isPending}
                    onClick={() =>
                      run(
                        { kind: "create", preset: p.key },
                        `${p.name} added to your theme library`,
                      )
                    }
                  >
                    <Plus aria-hidden /> Add {p.name}
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Dialog
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename theme"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || action.isPending}
              onClick={() =>
                renaming &&
                action.mutate(
                  { kind: "rename", id: renaming.id, name: name.trim() },
                  {
                    onSuccess: () => (setRenaming(null), toast.success("Theme renamed")),
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="Name">
          {({ id }) => (
            <Input id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name ?? "theme"}?`}
        description="The theme and its customizations are removed. Your live store doesn't change."
        confirmLabel="Delete"
        destructive
        pending={action.isPending}
        onConfirm={() =>
          deleting &&
          action.mutate(
            { kind: "delete", id: deleting.id },
            {
              onSuccess: () => (setDeleting(null), toast.success("Theme deleted")),
              onError: (e) => toast.error(e.message),
            },
          )
        }
        onClose={() => setDeleting(null)}
      />
      <ConfirmDialog
        open={!!publishing}
        title={`Publish ${publishing?.name ?? "theme"}?`}
        description={`Shoppers will see it right away. ${live?.name ?? "The current theme"} moves to your theme library.`}
        confirmLabel="Publish"
        pending={action.isPending}
        onConfirm={() =>
          publishing &&
          action.mutate(
            { kind: "publish", id: publishing.id },
            {
              onSuccess: () => (setPublishing(null), toast.success(`${publishing.name} is live`)),
              onError: (e) => toast.error(e.message),
            },
          )
        }
        onClose={() => setPublishing(null)}
      />
      {previewLink.isPending && (
        <p className="sr-only" role="status">
          Opening preview…
        </p>
      )}
    </div>
  );
}
