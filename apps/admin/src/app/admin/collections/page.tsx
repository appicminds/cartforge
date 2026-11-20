"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Layers, Plus } from "lucide-react";
import { PERMISSIONS } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Skeleton,
  TBody,
  THead,
  Table,
  Td,
  Th,
  Tr,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { COLLECTION_SORT_LABEL, useCollections, useSaveCollection } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";

const STATUS_TONE = { draft: "neutral", active: "success", archived: "warning" } as const;

export default function CollectionsPage() {
  const { can } = useSession();
  const canWrite = can(PERMISSIONS.COLLECTIONS_WRITE);
  const collections = useCollections();
  const router = useRouter();
  const toast = useToast();
  const save = useSaveCollection();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rows = collections.data?.data ?? [];

  const create = async () => {
    if (!title.trim()) return setError("Title is required");
    try {
      const c = await save.mutateAsync({ body: { title: title.trim() } });
      toast.success("Collection created");
      router.push(`/admin/collections/${c.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the collection.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Collections"
        description="Hand-picked groups of products, like Summer essentials or Gifts under $50."
        primaryAction={
          canWrite && (
            <Button
              onClick={() => {
                setTitle("");
                setError(null);
                setCreating(true);
              }}
            >
              <Plus aria-hidden /> Create collection
            </Button>
          )
        }
      />
      <Card>
        {collections.isPending ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : collections.isError ? (
          <div className="p-4">
            <Alert tone="danger" title="Couldn't load collections">
              {collections.error.message}
            </Alert>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Layers />}
            title="No collections yet"
            description="Curate products into collections to feature them on your storefront."
            action={
              canWrite && <Button onClick={() => setCreating(true)}>Create collection</Button>
            }
          />
        ) : (
          <Table>
            <caption className="sr-only">Collections</caption>
            <THead>
              <tr>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th className="text-right">Products</Th>
                <Th>Sorted</Th>
                <Th>Updated</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link
                      href={`/admin/collections/${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.title}
                    </Link>
                    <span className="block text-xs text-fg-subtle">/collections/{c.handle}</span>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[c.status]}>
                      {c.status[0]!.toUpperCase() + c.status.slice(1)}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{c.product_count}</Td>
                  <Td className="text-fg-muted">{COLLECTION_SORT_LABEL[c.sort_order]}</Td>
                  <Td className="text-fg-muted">{formatDate(c.updated_at)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Dialog
        open={creating}
        onClose={() => !save.isPending && setCreating(false)}
        title="Create collection"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => void create()}>
              Create
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Field label="Title" required error={error ?? undefined}>
            {({ id, invalid }) => (
              <Input
                id={id}
                invalid={invalid}
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            )}
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
