"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, FolderTree, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { PERMISSIONS, type CategorySummary } from "@cartforge/types";
import { MAX_CATEGORY_DEPTH, slugify } from "@cartforge/validation";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Menu,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
  useToast,
  type MenuItem,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import {
  useCategories,
  useDeleteCategory,
  useReorderCategories,
  useSaveCategory,
} from "@/lib/catalog";
import { useSession } from "@/lib/session";

type Editing =
  | { mode: "create"; parent_id: string | null }
  | { mode: "edit"; category: CategorySummary };

/** Category tree (PRD §8.6): nested up to 3 levels, reorder, safe delete. */
export default function CategoriesPage() {
  const { can } = useSession();
  const canWrite = can(PERMISSIONS.CATEGORIES_WRITE);
  const categories = useCategories();
  const reorder = useReorderCategories();
  const toast = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<CategorySummary | null>(null);
  const all = categories.data ?? [];

  const move = async (c: CategorySummary, dir: -1 | 1) => {
    const siblings = all.filter((x) => x.parent_id === c.parent_id);
    const i = siblings.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const ids = siblings.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    try {
      await reorder.mutateAsync({ parent_id: c.parent_id, ids });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reorder.");
    }
  };

  const menu = (c: CategorySummary): MenuItem[] => {
    const siblings = all.filter((x) => x.parent_id === c.parent_id);
    const i = siblings.findIndex((x) => x.id === c.id);
    return [
      {
        label: "Edit",
        icon: <Pencil />,
        onSelect: () => setEditing({ mode: "edit", category: c }),
      },
      ...(c.depth < MAX_CATEGORY_DEPTH - 1
        ? [
            {
              label: "Add subcategory",
              icon: <Plus />,
              onSelect: () => setEditing({ mode: "create", parent_id: c.id }),
            },
          ]
        : []),
      { label: "Move up", icon: <ArrowUp />, disabled: i === 0, onSelect: () => void move(c, -1) },
      {
        label: "Move down",
        icon: <ArrowDown />,
        disabled: i === siblings.length - 1,
        onSelect: () => void move(c, 1),
      },
      { label: "Delete", icon: <Trash2 />, destructive: true, onSelect: () => setDeleting(c) },
    ];
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categories"
        description={`Organize your catalog into a hierarchy, up to ${MAX_CATEGORY_DEPTH} levels deep.`}
        primaryAction={
          canWrite && (
            <Button onClick={() => setEditing({ mode: "create", parent_id: null })}>
              <Plus aria-hidden /> Add category
            </Button>
          )
        }
      />
      <Card>
        {categories.isPending ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : categories.isError ? (
          <div className="p-4">
            <Alert
              tone="danger"
              title="Couldn't load categories"
              action={
                <Button size="sm" variant="secondary" onClick={() => categories.refetch()}>
                  Retry
                </Button>
              }
            >
              {categories.error.message}
            </Alert>
          </div>
        ) : all.length === 0 ? (
          <EmptyState
            icon={<FolderTree />}
            title="No categories yet"
            description="Group products like Apparel › Tops › T-shirts so shoppers can browse."
            action={
              canWrite && (
                <Button onClick={() => setEditing({ mode: "create", parent_id: null })}>
                  Add category
                </Button>
              )
            }
          />
        ) : (
          <ul aria-label="Categories" className="divide-y divide-border">
            {all.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ paddingLeft: `${1 + c.depth * 1.75}rem` }}
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-fg-subtle">/{c.handle}</span>
                </div>
                {c.status === "archived" && <Badge tone="warning">Archived</Badge>}
                <span className="w-24 text-right text-sm tabular-nums text-fg-muted">
                  {c.product_count} product{c.product_count === 1 ? "" : "s"}
                </span>
                {canWrite && (
                  <Menu
                    label={`Actions for ${c.name}`}
                    trigger={<MoreHorizontal />}
                    items={menu(c)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <CategoryDialog editing={editing} all={all} onClose={() => setEditing(null)} />
      <DeleteCategoryDialog category={deleting} all={all} onClose={() => setDeleting(null)} />
    </div>
  );
}

function CategoryDialog({
  editing,
  all,
  onClose,
}: {
  editing: Editing | null;
  all: CategorySummary[];
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSaveCategory();
  const [f, setF] = useState({
    name: "",
    handle: "",
    parent_id: "",
    description: "",
    seo_title: "",
    seo_description: "",
    status: "active",
  });
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const current = editing?.mode === "edit" ? editing.category : null;

  useEffect(() => {
    if (!editing) return;
    setError(null);
    setF(
      current
        ? {
            name: current.name,
            handle: current.handle,
            parent_id: current.parent_id ?? "",
            description: current.description_html.replace(/<[^>]+>/g, "").trim(),
            seo_title: current.seo_title ?? "",
            seo_description: current.seo_description ?? "",
            status: current.status,
          }
        : {
            name: "",
            handle: "",
            parent_id: editing.mode === "create" ? (editing.parent_id ?? "") : "",
            description: "",
            seo_title: "",
            seo_description: "",
            status: "active",
          },
    );
  }, [editing, current]);

  // Valid parents: not this category or its descendants, and shallow enough.
  const descendants = new Set<string>();
  if (current) {
    descendants.add(current.id);
    for (const c of all) if (c.parent_id && descendants.has(c.parent_id)) descendants.add(c.id);
  }
  const parents = all.filter((c) => !descendants.has(c.id) && c.depth < MAX_CATEGORY_DEPTH - 1);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    if (!f.name.trim()) return setError({ message: "Name is required", field: "name" });
    const body = {
      name: f.name.trim(),
      ...(f.handle.trim() && { handle: f.handle.trim().toLowerCase() }),
      parent_id: f.parent_id || null,
      description_html: f.description.trim()
        ? `<p>${f.description.trim().replace(/[<>&]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[m]!)}</p>`
        : "",
      seo_title: f.seo_title.trim() || null,
      seo_description: f.seo_description.trim() || null,
      status: f.status as "active" | "archived",
    };
    try {
      await save.mutateAsync({ id: current?.id, body });
      toast.success(current ? "Category saved" : "Category created");
      onClose();
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      setError({
        message: e?.fields[0]?.message ?? e?.message ?? "Couldn't save.",
        field: e?.fields[0]?.path,
      });
    }
  };

  return (
    <Dialog
      open={Boolean(editing)}
      onClose={() => !save.isPending && onClose()}
      title={current ? `Edit ${current.name}` : "Add category"}
      className="w-[min(34rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {error && <Alert tone="danger" title={error.message} />}
        <Field label="Name" required error={error?.field === "name" ? error.message : undefined}>
          {({ id, invalid }) => (
            <Input
              id={id}
              invalid={invalid}
              value={f.name}
              maxLength={120}
              onChange={set("name")}
              autoFocus
            />
          )}
        </Field>
        <Field
          label="Parent category"
          error={error?.field === "parent_id" ? error.message : undefined}
        >
          {({ id }) => (
            <Select id={id} value={f.parent_id} onChange={set("parent_id")}>
              <option value="">None (top level)</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {"  ".repeat(p.depth)}
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="URL handle"
          hint="Leave blank to generate from the name."
          error={error?.field === "handle" ? error.message : undefined}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              value={f.handle}
              placeholder={slugify(f.name)}
              onChange={set("handle")}
            />
          )}
        </Field>
        <Field label="Description">
          {({ id }) => (
            <Textarea
              id={id}
              value={f.description}
              onChange={set("description")}
              className="min-h-16"
            />
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Page title (SEO)">
            {({ id }) => (
              <Input id={id} value={f.seo_title} onChange={set("seo_title")} placeholder={f.name} />
            )}
          </Field>
          <Field label="Status">
            {({ id }) => (
              <Select id={id} value={f.status} onChange={set("status")}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </Select>
            )}
          </Field>
        </div>
        <Field label="Meta description (SEO)">
          {({ id }) => (
            <Textarea
              id={id}
              value={f.seo_description}
              onChange={set("seo_description")}
              className="min-h-14"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}

function DeleteCategoryDialog({
  category,
  all,
  onClose,
}: {
  category: CategorySummary | null;
  all: CategorySummary[];
  onClose: () => void;
}) {
  const toast = useToast();
  const del = useDeleteCategory();
  const [choice, setChoice] = useState<"reassign" | "unassign">("reassign");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setChoice("reassign");
    setTarget("");
    setError(null);
  }, [category]);
  const others = all.filter((c) => c.id !== category?.id);
  const blockedByChildren = Boolean(category?.child_count);
  const hasProducts = Boolean(category?.product_count);

  return (
    <Dialog
      open={Boolean(category)}
      onClose={() => !del.isPending && onClose()}
      title={`Delete ${category?.name ?? "category"}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={del.isPending}>
            Cancel
          </Button>
          {!blockedByChildren && (
            <Button
              variant="destructive"
              loading={del.isPending}
              onClick={async () => {
                if (!category) return;
                if (hasProducts && choice === "reassign" && !target)
                  return setError("Choose a category to move products to.");
                try {
                  await del.mutateAsync({
                    id: category.id,
                    ...(hasProducts && choice === "reassign" && { reassign_to: target }),
                    ...(hasProducts && choice === "unassign" && { unassign: true }),
                  });
                  toast.success("Category deleted");
                  onClose();
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : "Couldn't delete.");
                }
              }}
            >
              Delete category
            </Button>
          )}
        </>
      }
    >
      {category && (
        <div className="flex flex-col gap-3 text-sm">
          {error && <Alert tone="danger" title={error} />}
          {blockedByChildren ? (
            <Alert tone="warning" title="This category has subcategories">
              Move or delete its {category.child_count} subcategor
              {category.child_count === 1 ? "y" : "ies"} first.
            </Alert>
          ) : hasProducts ? (
            <>
              <p>
                {category.product_count} product{category.product_count === 1 ? " is" : "s are"} in
                this category. What should happen to {category.product_count === 1 ? "it" : "them"}?
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="del-choice"
                  checked={choice === "reassign"}
                  onChange={() => setChoice("reassign")}
                  className="accent-primary"
                />
                Move to another category
              </label>
              {choice === "reassign" && (
                <Select
                  aria-label="Move products to"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="ml-6"
                >
                  <option value="">Choose a category…</option>
                  {others.map((c) => (
                    <option key={c.id} value={c.id}>
                      {"  ".repeat(c.depth)}
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="del-choice"
                  checked={choice === "unassign"}
                  onChange={() => setChoice("unassign")}
                  className="accent-primary"
                />
                Remove them from this category only
              </label>
            </>
          ) : (
            <p>This category has no products. This can't be undone.</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
