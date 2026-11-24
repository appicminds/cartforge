"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";
import { PERMISSIONS, type PageView } from "@cartforge/types";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  Textarea,
  useToast,
} from "@cartforge/ui";
import { ThemeTemplateCard } from "@/components/online-store/template-card";
import { Toggle } from "@/components/toggle";
import { ApiError } from "@/lib/api-client";
import { storefrontUrl, usePageAction, useStorefrontBase } from "@/lib/online-store";
import { useSession } from "@/lib/session";

const RichTextEditor = dynamic(() => import("@/components/products/rich-text-editor"), {
  ssr: false,
  loading: () => <div className="h-48 animate-pulse rounded-md bg-surface-sunken" />,
});

/** Add or edit a content page. */
export function PageEditor({
  page,
  initial,
}: {
  page: PageView | null;
  initial?: { title: string; body: string };
}) {
  const router = useRouter();
  const toast = useToast();
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.CONTENT_WRITE);
  const action = usePageAction();
  const base = useStorefrontBase();
  const contentId = useId();
  const [title, setTitle] = useState(page?.title ?? initial?.title ?? "");
  const [body, setBody] = useState(page?.body_html ?? initial?.body ?? "");
  const [handle, setHandle] = useState(page?.handle ?? "");
  const [published, setPublished] = useState(page?.published ?? true);
  const [seoTitle, setSeoTitle] = useState(page?.seo_title ?? "");
  const [seoDesc, setSeoDesc] = useState(page?.seo_description ?? "");
  const [deleting, setDeleting] = useState(false);
  const errors: Record<string, string> = {};
  if (action.error instanceof ApiError)
    for (const f of action.error.fields) errors[f.path] ??= f.message;

  const save = () =>
    action.mutate(
      {
        kind: "save",
        id: page?.id,
        body: {
          title,
          body_html: body,
          published,
          seo_title: seoTitle || null,
          seo_description: seoDesc || null,
          ...(handle ? { handle } : {}),
        },
      },
      {
        onSuccess: (saved) => {
          toast.success(page ? "Page saved" : "Page created");
          if (!page && saved) router.replace(`/admin/online-store/pages/${saved.id}`);
        },
        onError: (e) =>
          toast.error(
            e instanceof ApiError && e.fields.length ? "Check the highlighted fields." : e.message,
          ),
      },
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <fieldset disabled={!canEdit || action.isPending} className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <Field label="Title" required error={errors.title}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={title}
                  maxLength={200}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
            </Field>
            <div>
              <span id={contentId} className="mb-1.5 block text-sm font-medium">
                Content
              </span>
              <RichTextEditor
                value={body}
                onChange={setBody}
                labelledBy={contentId}
                disabled={!canEdit}
              />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Search engine listing" description="How the page appears in Google." />
          <CardBody className="flex flex-col gap-4">
            <Field label="Page title" hint="Empty: the page title.">
              {({ id }) => (
                <Input
                  id={id}
                  value={seoTitle}
                  maxLength={200}
                  onChange={(e) => setSeoTitle(e.target.value)}
                />
              )}
            </Field>
            <Field label="Description" hint="Empty: the start of the content.">
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={seoDesc}
                  maxLength={320}
                  onChange={(e) => setSeoDesc(e.target.value)}
                />
              )}
            </Field>
            <Field
              label="URL handle"
              error={errors.handle}
              hint={`Your page will be at /pages/${handle || "…"}${page ? "" : " (empty: from the title)"}`}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={handle}
                  placeholder="about-us"
                  onChange={(e) =>
                    setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                  }
                />
              )}
            </Field>
          </CardBody>
        </Card>
      </fieldset>
      <aside className="flex flex-col gap-4">
        <Card>
          <CardHeader title="Visibility" />
          <CardBody className="flex flex-col gap-4">
            <Toggle
              label="Visible on the store"
              description={
                published ? "Anyone can open this page." : "Hidden: only visible in theme previews."
              }
              checked={published}
              onChange={setPublished}
              disabled={!canEdit}
            />
            {page && base && page.published && (
              <a
                href={storefrontUrl(base, `/pages/${page.handle}`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View on your store <ExternalLink aria-hidden className="size-3.5" />
              </a>
            )}
          </CardBody>
        </Card>
        {page && <ThemeTemplateCard kind="page" id={page.id} />}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={action.isPending || !title.trim()}>
              {action.isPending ? "Saving…" : page ? "Save" : "Create page"}
            </Button>
            {page && (
              <Button variant="secondary" className="text-danger" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            )}
          </div>
        )}
      </aside>
      <ConfirmDialog
        open={deleting}
        title="Delete this page?"
        description="Links to it in menus are left out of your store until you change them."
        confirmLabel="Delete"
        destructive
        pending={action.isPending}
        onConfirm={() =>
          page &&
          action.mutate(
            { kind: "delete", id: page.id },
            {
              onSuccess: () => (
                toast.success("Page deleted"),
                router.replace("/admin/online-store/pages")
              ),
              onError: (e) => toast.error(e.message),
            },
          )
        }
        onClose={() => setDeleting(false)}
      />
    </div>
  );
}
