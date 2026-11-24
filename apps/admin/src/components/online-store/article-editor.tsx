"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";
import { PERMISSIONS, type ArticleView } from "@cartforge/types";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from "@cartforge/ui";
import { CoverImageField, type CoverImage } from "@/components/cover-image-field";
import { TagInput } from "@/components/tag-input";
import { Toggle } from "@/components/toggle";
import { ApiError } from "@/lib/api-client";
import { storefrontUrl, useArticleAction, useBlogs, useStorefrontBase } from "@/lib/online-store";
import { useSession } from "@/lib/session";

const RichTextEditor = dynamic(() => import("@/components/products/rich-text-editor"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-md bg-surface-sunken" />,
});

/** Local date-time input value (yyyy-mm-ddThh:mm). */
const localInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Add or edit a blog post. */
export function ArticleEditor({ article }: { article: ArticleView | null }) {
  const router = useRouter();
  const toast = useToast();
  const { can, store } = useSession();
  const canEdit = can(PERMISSIONS.CONTENT_WRITE);
  const blogs = useBlogs();
  const action = useArticleAction();
  const base = useStorefrontBase();
  const contentId = useId();
  const a = article;
  const [title, setTitle] = useState(a?.title ?? "");
  const [body, setBody] = useState(a?.body_html ?? "");
  const [excerpt, setExcerpt] = useState(a?.excerpt ?? "");
  const [blogId, setBlogId] = useState(a?.blog_id ?? "");
  const [image, setImage] = useState<CoverImage | null>(
    a?.image ? { id: a.image.media_asset_id, url: a.image.medium_url ?? a.image.url } : null,
  );
  const [author, setAuthor] = useState(a?.author ?? "");
  const [tags, setTags] = useState<string[]>(a?.tags ?? []);
  const [published, setPublished] = useState(a?.published ?? false);
  const [publishedAt, setPublishedAt] = useState(localInput(a?.published_at));
  const [handle, setHandle] = useState(a?.handle ?? "");
  const [seoTitle, setSeoTitle] = useState(a?.seo_title ?? "");
  const [seoDesc, setSeoDesc] = useState(a?.seo_description ?? "");
  const [deleting, setDeleting] = useState(false);
  const blog = blogId || blogs.data?.[0]?.id || "";
  const errors: Record<string, string> = {};
  if (action.error instanceof ApiError)
    for (const f of action.error.fields) errors[f.path] ??= f.message;

  const save = () =>
    action.mutate(
      {
        kind: "save",
        id: a?.id,
        body: {
          blog_id: blog,
          title,
          body_html: body,
          excerpt,
          image_id: image?.id ?? null,
          author: author || null,
          tags,
          published,
          published_at: publishedAt ? new Date(publishedAt).toISOString() : null,
          seo_title: seoTitle || null,
          seo_description: seoDesc || null,
          ...(handle ? { handle } : {}),
        },
      },
      {
        onSuccess: (saved) => {
          toast.success(a ? "Blog post saved" : "Blog post created");
          if (!a && saved) router.replace(`/admin/online-store/blog/${saved.id}`);
        },
        onError: (e) =>
          toast.error(
            e instanceof ApiError && e.fields.length ? "Check the highlighted fields." : e.message,
          ),
      },
    );

  const live = a && a.published && a.published_at && new Date(a.published_at) <= new Date();
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
            <Field
              label="Excerpt"
              hint="A short summary shown in the blog list. Empty: the start of the post."
            >
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={3}
                  maxLength={500}
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                />
              )}
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Search engine listing" />
          <CardBody className="flex flex-col gap-4">
            <Field label="Page title" hint="Empty: the post title.">
              {({ id }) => (
                <Input
                  id={id}
                  value={seoTitle}
                  maxLength={200}
                  onChange={(e) => setSeoTitle(e.target.value)}
                />
              )}
            </Field>
            <Field label="Description" hint="Empty: the excerpt.">
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
              hint={a ? undefined : "Empty: from the title."}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={handle}
                  placeholder="eid-styling-guide"
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
              label="Published"
              description={
                published ? "Shown on your blog from the publish date." : "Hidden: a draft."
              }
              checked={published}
              onChange={setPublished}
              disabled={!canEdit}
            />
            <Field
              label="Publish date"
              hint="Empty: now, when published. A future date schedules it."
            >
              {({ id }) => (
                <Input
                  id={id}
                  type="datetime-local"
                  value={publishedAt}
                  disabled={!canEdit}
                  onChange={(e) => setPublishedAt(e.target.value)}
                />
              )}
            </Field>
            {a && base && live && (
              <a
                href={storefrontUrl(base, `/blogs/${a.blog_handle}/${a.handle}`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View on your store <ExternalLink aria-hidden className="size-3.5" />
              </a>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Organization" />
          <CardBody className="flex flex-col gap-4">
            <Field label="Blog" error={errors.blog_id}>
              {({ id }) => (
                <Select
                  id={id}
                  value={blog}
                  disabled={!canEdit}
                  onChange={(e) => setBlogId(e.target.value)}
                >
                  {(blogs.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Author">
              {({ id }) => (
                <Input
                  id={id}
                  value={author}
                  maxLength={100}
                  disabled={!canEdit}
                  onChange={(e) => setAuthor(e.target.value)}
                />
              )}
            </Field>
            <TagInput label="Tags" values={tags} onChange={setTags} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Featured image" />
          <CardBody>
            <CoverImageField
              value={image}
              onChange={setImage}
              auto={null}
              storeId={store?.store_id}
              disabled={!canEdit}
              emptyHint="Shown at the top of the post and in the blog list."
            />
          </CardBody>
        </Card>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={action.isPending || !title.trim() || !blog}>
              {action.isPending ? "Saving…" : a ? "Save" : "Create blog post"}
            </Button>
            {a && (
              <Button variant="secondary" className="text-danger" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            )}
          </div>
        )}
      </aside>
      <ConfirmDialog
        open={deleting}
        title="Delete this blog post?"
        description="It's removed from your blog straight away."
        confirmLabel="Delete"
        destructive
        pending={action.isPending}
        onConfirm={() =>
          a &&
          action.mutate(
            { kind: "delete", id: a.id },
            {
              onSuccess: () => (
                toast.success("Blog post deleted"),
                router.replace("/admin/online-store/blog")
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
