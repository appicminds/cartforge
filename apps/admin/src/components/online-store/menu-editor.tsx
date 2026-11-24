"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash2 } from "lucide-react";
import { PERMISSIONS, type MenuItem, type MenuLinkType, type MenuView } from "@cartforge/types";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Field,
  Input,
  Select,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { useCategories, useCollections } from "@/lib/catalog";
import { useBlogs, useMenuAction, usePages } from "@/lib/online-store";
import { useProductList } from "@/lib/products";
import { useSession } from "@/lib/session";

const LINK_TYPES: { value: MenuLinkType; label: string }[] = [
  { value: "home", label: "Home page" },
  { value: "products", label: "All products" },
  { value: "collections", label: "All collections" },
  { value: "search", label: "Search" },
  { value: "collection", label: "A collection" },
  { value: "category", label: "A category" },
  { value: "product", label: "A product" },
  { value: "page", label: "A page" },
  { value: "blog", label: "A blog" },
  { value: "url", label: "Web address" },
];
const MAX_DEPTH = 3;

const newItem = (): MenuItem => ({
  id: `item-${Math.random().toString(36).slice(2, 9)}`,
  title: "",
  link: { type: "products" },
  children: [],
});

/** Flattened view of the tree for editing: depth + path of indexes. */
type Row = { item: MenuItem; depth: number; path: number[] };
const flatten = (items: MenuItem[], depth = 0, path: number[] = []): Row[] =>
  items.flatMap((item, i) => [
    { item, depth, path: [...path, i] },
    ...flatten(item.children ?? [], depth + 1, [...path, i]),
  ]);

function siblings(tree: MenuItem[], path: number[]): MenuItem[] {
  let list = tree;
  for (const i of path.slice(0, -1)) list = list[i]!.children;
  return list;
}

function LinkPicker({
  link,
  onChange,
  idPrefix,
}: {
  link: MenuItem["link"];
  onChange: (l: MenuItem["link"]) => void;
  idPrefix: string;
}) {
  const collections = useCollections({ page_size: 100 });
  const categories = useCategories();
  const products = useProductList({ page: 1, page_size: 100, sort: "title", order: "asc" });
  const pages = usePages();
  const blogs = useBlogs();
  const options =
    link.type === "collection"
      ? (collections.data?.data ?? []).map((c) => ({ id: c.id, label: c.title }))
      : link.type === "category"
        ? (categories.data ?? []).map((c) => ({ id: c.id, label: c.path }))
        : link.type === "product"
          ? (products.data?.data ?? []).map((p) => ({ id: p.id, label: p.title }))
          : link.type === "page"
            ? (pages.data ?? []).map((p) => ({ id: p.id, label: p.title }))
            : link.type === "blog"
              ? (blogs.data ?? []).map((b) => ({ id: b.id, label: b.title }))
              : null;
  return (
    <div className="flex flex-wrap gap-2">
      <Select
        aria-label="Links to"
        id={`${idPrefix}-type`}
        value={link.type}
        className="w-44"
        onChange={(e) => onChange({ type: e.target.value as MenuLinkType })}
      >
        {LINK_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      {options && (
        <Select
          aria-label={`Choose ${link.type}`}
          value={link.id ?? ""}
          className="min-w-44 flex-1"
          onChange={(e) => onChange({ type: link.type, id: e.target.value || undefined })}
        >
          <option value="">Choose…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
      {link.type === "url" && (
        <Input
          aria-label="Web address"
          value={link.url ?? ""}
          placeholder="/pages/about or https://wa.me/92…"
          className="min-w-52 flex-1"
          onChange={(e) => onChange({ type: "url", url: e.target.value })}
        />
      )}
    </div>
  );
}

/** Add or edit a menu: items up to three levels deep. */
export function MenuEditor({ menu }: { menu: MenuView | null }) {
  const router = useRouter();
  const toast = useToast();
  const { can } = useSession();
  const canEdit = can(PERMISSIONS.CONTENT_WRITE);
  const action = useMenuAction();
  const [title, setTitle] = useState(menu?.title ?? "");
  const [handle, setHandle] = useState(menu?.handle ?? "");
  const [items, setItems] = useState<MenuItem[]>(menu?.items ?? []);
  const [deleting, setDeleting] = useState(false);
  const errors: Record<string, string> = {};
  if (action.error instanceof ApiError)
    for (const f of action.error.fields) errors[f.path] ??= f.message;
  const rows = flatten(items);

  const edit = (fn: (tree: MenuItem[]) => void) =>
    setItems((t) => {
      const next = structuredClone(t);
      fn(next);
      return next;
    });
  const at = (tree: MenuItem[], path: number[]) => siblings(tree, path)[path[path.length - 1]!]!;

  const moveRow = (path: number[], dir: -1 | 1) =>
    edit((t) => {
      const list = siblings(t, path);
      const i = path[path.length - 1]!;
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j]!, list[i]!];
    });
  const indent = (path: number[]) =>
    edit((t) => {
      const list = siblings(t, path);
      const i = path[path.length - 1]!;
      if (i === 0) return;
      const [it] = list.splice(i, 1);
      list[i - 1]!.children.push(it!);
    });
  const outdent = (path: number[]) =>
    edit((t) => {
      if (path.length < 2) return;
      const list = siblings(t, path);
      const i = path[path.length - 1]!;
      const [it] = list.splice(i, 1);
      const parentPath = path.slice(0, -1);
      const parentList = siblings(t, parentPath);
      parentList.splice(parentPath[parentPath.length - 1]! + 1, 0, it!);
    });
  const depthOf = (it: MenuItem): number => 1 + Math.max(0, ...it.children.map(depthOf));

  const save = () =>
    action.mutate(
      { kind: "save", id: menu?.id, body: { title, ...(handle ? { handle } : {}), items } },
      {
        onSuccess: (saved) => {
          toast.success(menu ? "Menu saved" : "Menu created");
          if (!menu && saved) router.replace(`/admin/online-store/navigation/${saved.id}`);
        },
        onError: (e) =>
          toast.error(
            e instanceof ApiError && e.fields.length ? `${e.fields[0]!.message}` : e.message,
          ),
      },
    );

  return (
    <div className="flex flex-col gap-6">
      <fieldset disabled={!canEdit || action.isPending} className="flex flex-col gap-6">
        <Card>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required error={errors.title}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={title}
                  maxLength={80}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
            </Field>
            <Field
              label="Handle"
              error={errors.handle}
              hint="Used to pick this menu in the theme editor."
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  value={handle}
                  placeholder="from the title"
                  onChange={(e) =>
                    setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
                  }
                />
              )}
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Menu items"
            description="Use → to put an item under the one above it (a dropdown), ← to bring it back."
          />
          <CardBody className="flex flex-col gap-3">
            {rows.length === 0 && <p className="text-sm text-fg-muted">No items yet.</p>}
            <ul className="flex flex-col gap-3" aria-label="Menu items">
              {rows.map(({ item, depth, path }) => {
                const key = path.join("-");
                const sibs = siblings(items, path);
                const i = path[path.length - 1]!;
                const canIndent = i > 0 && depth + depthOf(item) < MAX_DEPTH;
                const prefix = `menu-${key}`;
                return (
                  <li
                    key={item.id}
                    className="rounded-md border border-border p-3"
                    style={{ marginLeft: depth * 24 }}
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <Input
                        aria-label="Item title"
                        value={item.title}
                        placeholder="Title"
                        className="w-48"
                        maxLength={80}
                        onChange={(e) => edit((t) => void (at(t, path).title = e.target.value))}
                      />
                      <div className="min-w-0 flex-1">
                        <LinkPicker
                          idPrefix={prefix}
                          link={item.link}
                          onChange={(l) => edit((t) => void (at(t, path).link = l))}
                        />
                      </div>
                      <div className="flex items-center">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Move ${item.title || "item"} up`}
                          disabled={i === 0}
                          onClick={() => moveRow(path, -1)}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Move ${item.title || "item"} down`}
                          disabled={i === sibs.length - 1}
                          onClick={() => moveRow(path, 1)}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Put ${item.title || "item"} under the item above`}
                          disabled={!canIndent}
                          onClick={() => indent(path)}
                        >
                          <ArrowRight aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Bring ${item.title || "item"} up a level`}
                          disabled={depth === 0}
                          onClick={() => outdent(path)}
                        >
                          <ArrowLeft aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-danger"
                          aria-label={`Remove ${item.title || "item"}`}
                          onClick={() => edit((t) => void siblings(t, path).splice(i, 1))}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div>
              <Button variant="secondary" onClick={() => setItems((t) => [...t, newItem()])}>
                <Plus aria-hidden /> Add menu item
              </Button>
            </div>
          </CardBody>
        </Card>
      </fieldset>
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={action.isPending || !title.trim()}>
            {action.isPending ? "Saving…" : menu ? "Save menu" : "Create menu"}
          </Button>
          {menu && (
            <Button variant="secondary" className="text-danger" onClick={() => setDeleting(true)}>
              Delete menu
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={deleting}
        title="Delete this menu?"
        description="Sections that use it show no links until you pick another menu."
        confirmLabel="Delete"
        destructive
        pending={action.isPending}
        onConfirm={() =>
          menu &&
          action.mutate(
            { kind: "delete", id: menu.id },
            {
              onSuccess: () => (
                toast.success("Menu deleted"),
                router.replace("/admin/online-store/navigation")
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
