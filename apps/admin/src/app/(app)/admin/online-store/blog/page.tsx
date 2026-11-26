"use client";

import Link from "next/link";
import { useState } from "react";
import { Newspaper, Plus } from "lucide-react";
import { PERMISSIONS, type BlogView } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  useToast,
} from "@cartforge/ui";
import { OnlineStoreTabs } from "@/components/online-store/tabs";
import { useBreadcrumbTitle } from "@/lib/breadcrumbs";
import { formatDateTime } from "@/lib/format";
import { useArticles, useBlogAction, useBlogs } from "@/lib/online-store";
import { useSession } from "@/lib/session";

/** Online store → Blog posts. */
export default function BlogPostsPage() {
  useBreadcrumbTitle("Blog posts");
  const toast = useToast();
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.CONTENT_WRITE);
  const blogs = useBlogs();
  const [blogId, setBlogId] = useState("");
  const articles = useArticles(blogId || undefined);
  const blogAction = useBlogAction();
  const [managing, setManaging] = useState(false);
  const [editing, setEditing] = useState<BlogView | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<BlogView | null>(null);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Online store"
        description="Write blog posts: style guides, new arrivals, behind the scenes. Show the latest ones on your home page with the “Blog posts” section."
        primaryAction={
          canEdit ? (
            <Button asChild>
              <Link href="/admin/online-store/blog/new">
                <Plus aria-hidden /> Add blog post
              </Link>
            </Button>
          ) : undefined
        }
        secondaryActions={
          canEdit ? (
            <Button variant="secondary" onClick={() => setManaging(true)}>
              Manage blogs
            </Button>
          ) : undefined
        }
      />
      <OnlineStoreTabs />
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <Select
            aria-label="Blog"
            value={blogId}
            onChange={(e) => setBlogId(e.target.value)}
            className="w-56"
          >
            <option value="">All blogs</option>
            {(blogs.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </Select>
        </div>
        {articles.isError ? (
          <div className="p-4">
            <Alert tone="danger" title="Couldn't load blog posts">
              {articles.error.message}
            </Alert>
          </div>
        ) : !articles.data ? (
          <div className="p-4">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : articles.data.length === 0 ? (
          <EmptyState
            icon={<Newspaper />}
            title="No blog posts yet"
            description="Your first post could be a styling guide or the story of your brand."
          />
        ) : (
          <Table>
            <caption className="sr-only">Blog posts</caption>
            <THead>
              <Tr>
                <Th>Title</Th>
                <Th>Blog</Th>
                <Th>Status</Th>
                <Th>Date</Th>
              </Tr>
            </THead>
            <TBody>
              {articles.data.map((a) => {
                const scheduled = a.published && a.published_at && new Date(a.published_at) > now;
                return (
                  <Tr key={a.id}>
                    <Td className="max-w-80">
                      <Link
                        href={`/admin/online-store/blog/${a.id}`}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {a.title}
                      </Link>
                      {a.author && <p className="text-xs text-fg-muted">by {a.author}</p>}
                    </Td>
                    <Td className="text-fg-muted">{a.blog_title}</Td>
                    <Td>
                      <Badge tone={!a.published ? "neutral" : scheduled ? "info" : "success"}>
                        {!a.published ? "Draft" : scheduled ? "Scheduled" : "Published"}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-fg-muted">
                      {a.published_at ? formatDateTime(a.published_at) : "—"}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog open={managing} onClose={() => setManaging(false)} title="Blogs">
        <div className="flex flex-col gap-3">
          <ul className="divide-y divide-border">
            {(blogs.data ?? []).map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">
                  <span className="font-medium">{b.title}</span>{" "}
                  <span className="text-fg-muted">
                    /blogs/{b.handle} · {b.article_count} {b.article_count === 1 ? "post" : "posts"}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => (setEditing(b), setTitle(b.title))}
                >
                  Rename
                </Button>
                {(blogs.data?.length ?? 0) > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => setDeleting(b)}
                  >
                    Delete
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <Button variant="secondary" onClick={() => (setEditing("new"), setTitle(""))}>
            <Plus aria-hidden /> Add blog
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add blog" : "Rename blog"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={!title.trim() || blogAction.isPending}
              onClick={() =>
                editing &&
                blogAction.mutate(
                  {
                    kind: "save",
                    id: editing === "new" ? undefined : editing.id,
                    title: title.trim(),
                  },
                  {
                    onSuccess: () => (setEditing(null), toast.success("Blog saved")),
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
        <Field label="Blog title" hint="e.g. News, Style guide, Behind the scenes">
          {({ id }) => (
            <Input
              id={id}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.title ?? "blog"}?`}
        description={`Its ${deleting?.article_count ?? 0} blog posts are deleted too.`}
        confirmLabel="Delete blog"
        destructive
        pending={blogAction.isPending}
        onConfirm={() =>
          deleting &&
          blogAction.mutate(
            { kind: "delete", id: deleting.id },
            {
              onSuccess: () => (setDeleting(null), toast.success("Blog deleted")),
              onError: (e) => toast.error(e.message),
            },
          )
        }
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
