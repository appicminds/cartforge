"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  History,
  Monitor,
  MousePointerClick,
  Plus,
  Redo2,
  Smartphone,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  GLOBAL_SETTINGS,
  MAX_SCHEMES,
  SCHEME_FIELDS,
  SECTIONS,
  SECTION_DEFS,
  TEMPLATE_KEYS,
  TEMPLATE_LABELS,
  TEMPLATE_PREVIEW_PATHS,
  canAddTo,
  newBlock,
  newId,
  newSection,
  schemeContrastProblems,
  validateTheme,
  withBrandSchemes,
  type BlockInstance,
  type ColorScheme,
  type SectionDef,
  type SectionInstance,
  type TemplateKey,
  type ThemeData,
} from "@cartforge/theme-engine";
import type { ThemeDetail, ThemeImage } from "@cartforge/types";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  Input,
  Select,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import {
  storefrontUrl,
  usePages,
  useSaveTheme,
  useStorefrontBase,
  useThemeAction,
  useThemePreviewLink,
  useThemeVersions,
} from "@/lib/online-store";
import { useProductList } from "@/lib/products";
import { SettingsForm, SettingField, type FieldCtx } from "./fields";
import { useHistory } from "./history";

type Where = { group: "header" | "footer" } | { template: TemplateKey };
type Sel =
  | null
  | { kind: "section"; where: Where; id: string }
  | { kind: "block"; where: Where; id: string; block: string }
  | { kind: "settings"; group: string }
  | { kind: "scheme"; id: string };

const listOf = (d: ThemeData, w: Where): SectionInstance[] =>
  "group" in w ? d.groups[w.group] : d.templates[w.template];
const pathOf = (w: Where) => ("group" in w ? `groups.${w.group}` : `templates.${w.template}`);
const sameWhere = (a: Where, b: Where) => pathOf(a) === pathOf(b);

/** A short label for a block in the list ("Heading: New season"). */
function blockLabel(def: SectionDef, b: BlockInstance) {
  const name = def.blocks?.find((x) => x.type === b.type)?.name ?? b.type;
  const s = b.settings;
  const hint = [s.heading, s.title, s.text, s.question, s.author, s.label].find(
    (v) => typeof v === "string" && v.trim() && !v.includes("<"),
  ) as string | undefined;
  return hint ? `${name}: ${hint}` : name;
}

function templateForPath(path: string): TemplateKey | null {
  const p = path.split("?")[0]!;
  if (p === "/") return "home";
  if (/^\/products\/[^/]+$/.test(p)) return "product";
  if (p === "/products" || /^\/(collections|categories)\/[^/]+$/.test(p)) return "collection";
  if (p === "/collections") return "list_collections";
  if (p === "/cart") return "cart";
  if (p === "/search") return "search";
  if (/^\/pages\/[^/]+$/.test(p)) return "page";
  return null;
}

function move<T>(list: T[], from: number, to: number) {
  if (to < 0 || to >= list.length || from === to) return;
  const [x] = list.splice(from, 1);
  list.splice(to, 0, x!);
}

/** The theme editor: section list · live preview · settings. */
export function ThemeEditor({
  theme,
  onReload,
}: {
  theme: ThemeDetail;
  onReload: () => Promise<void>;
}) {
  const toast = useToast();
  const h = useHistory(theme.data as ThemeData);
  const data = h.present;
  const save = useSaveTheme(theme.id);
  const action = useThemeAction();
  const previewLink = useThemePreviewLink();
  const base = useStorefrontBase();
  const [images, setImages] = useState<Record<string, ThemeImage>>(theme.images);
  const [template, setTemplate] = useState<TemplateKey>("home");
  const [sel, setSel] = useState<Sel>(null);
  const [tab, setTab] = useState<"sections" | "settings">("sections");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [inspect, setInspect] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Where | null>(null);
  const [status, setStatus] = useState<"saved" | "pending" | "saving" | "error" | "invalid">(
    "saved",
  );
  const [token, setToken] = useState<string | null>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"list" | "settings" | "preview">("list");
  const frame = useRef<HTMLIFrameElement>(null);
  const savedJson = useRef(JSON.stringify(theme.data));
  const dragging = useRef<{ list: string; index: number } | null>(null);

  const products = useProductList({
    page: 1,
    page_size: 1,
    status: "active",
    sort: "updated_at",
    order: "desc",
  });
  const pages = usePages();
  const versions = useThemeVersions(theme.id, versionsOpen);

  // ── Validation (same rules as the API) ──
  const errors = useMemo(() => validateTheme(data, true).errors, [data]);
  const errorMap = useMemo(() => new Map(errors.map((e) => [e.path, e.message])), [errors]);

  // ── Preview frame ──
  const pathFor = useCallback(
    (t: TemplateKey) => {
      if (t === "product") {
        const p = products.data?.data[0];
        return p ? `/products/${p.handle}` : "/products";
      }
      if (t === "page") {
        const p = pages.data?.find((x) => x.published) ?? pages.data?.[0];
        return p ? `/pages/${p.handle}` : "/";
      }
      return TEMPLATE_PREVIEW_PATHS[t];
    },
    [products.data, pages.data],
  );

  useEffect(() => {
    previewLink.mutate(theme.id, { onSuccess: (l) => setToken(l.token) });
    const t = window.setInterval(
      () => previewLink.mutate(theme.id, { onSuccess: (l) => setToken(l.token) }),
      45 * 60_000,
    );
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per theme
  }, [theme.id]);

  const navigate = useCallback(
    (t: TemplateKey) => {
      setTemplate(t);
      if (base && token) setFrameSrc(storefrontUrl(base, pathFor(t), { theme_preview: token }));
    },
    [base, token, pathFor],
  );

  useEffect(() => {
    if (base && token && !frameSrc)
      setFrameSrc(storefrontUrl(base, pathFor(template), { theme_preview: token }));
  }, [base, token, frameSrc, pathFor, template]);

  const post = useCallback((msg: object) => {
    frame.current?.contentWindow?.postMessage({ source: "cf-editor", ...msg }, "*");
  }, []);

  // Messages from the preview.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = e.data as {
        source?: string;
        type?: string;
        path?: string;
        section?: string;
        block?: string | null;
      };
      if (m?.source !== "cf-preview") return;
      if (m.type === "ready") {
        post({ type: "inspect", on: inspect });
        const t = m.path ? templateForPath(m.path) : null;
        if (t) setTemplate(t);
      }
      if (m.type === "select" && m.section) {
        const wheres: Where[] = [{ group: "header" }, { group: "footer" }, { template }];
        const where = wheres.find((w) => listOf(data, w).some((s) => s.id === m.section));
        if (!where) return;
        setTab("sections");
        setExpanded((x) => new Set(x).add(m.section!));
        setSel(
          m.block
            ? { kind: "block", where, id: m.section, block: m.block }
            : { kind: "section", where, id: m.section },
        );
        setMobilePanel("settings");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [data, template, inspect, post]);

  useEffect(() => post({ type: "inspect", on: inspect }), [inspect, post]);
  useEffect(() => {
    if (sel?.kind === "section") post({ type: "select", section: sel.id });
    else if (sel?.kind === "block") post({ type: "select", section: sel.id, block: sel.block });
    else post({ type: "select", section: null });
  }, [sel, post]);

  // ── Autosave ──
  const saveNow = useCallback(async () => {
    const json = JSON.stringify(data);
    if (json === savedJson.current) {
      setStatus("saved");
      return true;
    }
    if (errors.length) {
      setStatus("invalid");
      return false;
    }
    setStatus("saving");
    try {
      await save.mutateAsync(data);
      savedJson.current = json;
      setStatus("saved");
      post({ type: "refresh" });
      return true;
    } catch (err) {
      setStatus("error");
      toast.error(
        err instanceof ApiError && err.fields[0]
          ? `${err.fields[0].message} (${err.fields[0].path})`
          : (err as Error).message,
      );
      return false;
    }
  }, [data, errors, save, post, toast]);

  useEffect(() => {
    // Back to what's saved (e.g. an invalid edit was corrected, or undone).
    if (JSON.stringify(data) === savedJson.current) {
      setStatus("saved");
      return;
    }
    setStatus(errors.length ? "invalid" : "pending");
    if (errors.length) return;
    const t = window.setTimeout(() => void saveNow(), 700);
    return () => window.clearTimeout(t);
  }, [data, errors.length, saveNow]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  // Undo / redo shortcuts (outside text fields, which have their own).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        h.undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        h.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h]);

  // ── Changes ──
  const fieldCtx: FieldCtx = {
    schemes: data.color_schemes,
    images,
    addImage: (id, img) => setImages((m) => ({ ...m, [id]: img })),
  };
  const findSection = (d: ThemeData, w: Where, id: string) => listOf(d, w).find((s) => s.id === id);

  const addSection = (w: Where, type: string) => {
    const s = newSection(type);
    h.change((d) => {
      const list = listOf(d, w);
      list.push(s);
    });
    setExpanded((x) => new Set(x).add(s.id));
    setSel({ kind: "section", where: w, id: s.id });
    setAdding(null);
    setMobilePanel("settings");
  };

  const removeSel = () => {
    if (!sel || (sel.kind !== "section" && sel.kind !== "block")) return;
    h.change((d) => {
      const list = listOf(d, sel.where);
      if (sel.kind === "section")
        list.splice(
          list.findIndex((s) => s.id === sel.id),
          1,
        );
      else {
        const s = list.find((x) => x.id === sel.id);
        if (s) s.blocks = s.blocks.filter((b) => b.id !== sel.block);
      }
    });
    setSel(sel.kind === "block" ? { kind: "section", where: sel.where, id: sel.id } : null);
  };

  const duplicateSel = () => {
    if (!sel || (sel.kind !== "section" && sel.kind !== "block")) return;
    h.change((d) => {
      const list = listOf(d, sel.where);
      const i = list.findIndex((s) => s.id === sel.id);
      const s = list[i];
      if (!s) return;
      if (sel.kind === "section") {
        const copy = structuredClone(s);
        copy.id = newId(`${s.type.replace(/_/g, "-").slice(0, 12)}-`);
        copy.blocks.forEach((b) => (b.id = newId(`${b.type.replace(/_/g, "-").slice(0, 10)}-`)));
        list.splice(i + 1, 0, copy);
      } else {
        const j = s.blocks.findIndex((b) => b.id === sel.block);
        const copy = structuredClone(s.blocks[j]!);
        copy.id = newId(`${copy.type.replace(/_/g, "-").slice(0, 10)}-`);
        s.blocks.splice(j + 1, 0, copy);
      }
    });
  };

  const moveSel = (dir: -1 | 1) => {
    if (!sel || (sel.kind !== "section" && sel.kind !== "block")) return;
    h.change((d) => {
      const list = listOf(d, sel.where);
      const i = list.findIndex((s) => s.id === sel.id);
      if (sel.kind === "section") move(list, i, i + dir);
      else {
        const s = list[i]!;
        const j = s.blocks.findIndex((b) => b.id === sel.block);
        move(s.blocks, j, j + dir);
      }
    });
  };

  const toggleHidden = (w: Where, id: string, block?: string) =>
    h.change((d) => {
      const s = findSection(d, w, id);
      if (!s) return;
      const target = block ? s.blocks.find((b) => b.id === block) : s;
      if (!target) return;
      if (target.disabled) delete target.disabled;
      else target.disabled = true;
    });

  const addBlock = (w: Where, id: string, type: string) => {
    const def = SECTIONS[findSection(data, w, id)?.type ?? ""];
    if (!def) return;
    const b = newBlock(def, type);
    h.change((d) => findSection(d, w, id)?.blocks.push(b));
    setExpanded((x) => new Set(x).add(id));
    setSel({ kind: "block", where: w, id, block: b.id });
  };

  // ── Publishing ──
  const publish = async () => {
    if (!(await saveNow())) return toast.error("Fix the highlighted settings before publishing.");
    action.mutate(
      { kind: "publish", id: theme.id },
      {
        onSuccess: () => {
          setPublishing(false);
          toast.success(
            theme.role === "live"
              ? "Published — shoppers see your changes now"
              : `${theme.name} is now live`,
          );
          void onReload();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const restore = (version: string) =>
    action.mutate(
      { kind: "restore", id: theme.id, version },
      {
        onSuccess: async () => {
          setRestoring(null);
          setVersionsOpen(false);
          toast.success(
            theme.role === "live" ? "Version restored and published" : "Version restored",
          );
          await onReload();
        },
        onError: (e) => toast.error(e.message),
      },
    );

  // ── Rendering helpers ──
  const sectionList = ({ where, title }: { where: Where; title: string }) => {
    const list = listOf(data, where);
    const key = pathOf(where);
    const canAdd = SECTION_DEFS.some((d) =>
      canAddTo(d, "group" in where ? { group: where.group } : { template: where.template }),
    );
    return (
      <div className="flex flex-col gap-0.5">
        <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {title}
        </p>
        <ul aria-label={title}>
          {list.map((s, i) => {
            const def = SECTIONS[s.type];
            if (!def) return null;
            const open = expanded.has(s.id);
            const active = sel && "where" in sel && sameWhere(sel.where, where) && sel.id === s.id;
            const hasErr = errors.some((e) => e.path.startsWith(`${key}.${i}.`));
            return (
              <li
                key={s.id}
                draggable={!def.main}
                onDragStart={() => (dragging.current = { list: key, index: i })}
                onDragOver={(e) => dragging.current?.list === key && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragging.current;
                  dragging.current = null;
                  if (from?.list === key) h.change((d) => move(listOf(d, where), from.index, i));
                }}
              >
                <div
                  className={`group flex items-center gap-1 rounded-md pr-1 text-sm ${active && sel?.kind === "section" ? "bg-primary/10 text-fg" : "hover:bg-surface-sunken"} ${s.disabled ? "text-fg-subtle" : ""}`}
                >
                  <span
                    aria-hidden
                    className={`cursor-grab px-0.5 text-fg-subtle ${def.main ? "invisible" : ""}`}
                  >
                    <GripVertical className="size-3.5" />
                  </span>
                  {def.blocks?.length ? (
                    <button
                      type="button"
                      aria-label={open ? `Collapse ${def.name}` : `Expand ${def.name}`}
                      aria-expanded={open}
                      onClick={() =>
                        setExpanded((x) => {
                          const n = new Set(x);
                          if (n.has(s.id)) n.delete(s.id);
                          else n.add(s.id);
                          return n;
                        })
                      }
                      className="rounded p-0.5 hover:bg-surface"
                    >
                      {open ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                    </button>
                  ) : (
                    <span className="w-[18px]" />
                  )}
                  <button
                    type="button"
                    onClick={() => (
                      setSel({ kind: "section", where, id: s.id }),
                      setMobilePanel("settings")
                    )}
                    className="min-w-0 flex-1 truncate py-1.5 text-left"
                  >
                    {def.name}
                    {hasErr && (
                      <span className="ml-1 text-danger" aria-label="has errors">
                        •
                      </span>
                    )}
                  </button>
                  {!def.main && (
                    <button
                      type="button"
                      aria-label={s.disabled ? `Show ${def.name}` : `Hide ${def.name}`}
                      onClick={() => toggleHidden(where, s.id)}
                      className={`rounded p-1 hover:bg-surface ${s.disabled ? "" : "opacity-0 focus:opacity-100 group-hover:opacity-100"}`}
                    >
                      {s.disabled ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  )}
                </div>
                {open && def.blocks?.length ? (
                  <ul
                    className="ml-6 border-l border-border pl-1"
                    aria-label={`${def.name} blocks`}
                  >
                    {s.blocks.map((b, j) => {
                      const bActive =
                        sel?.kind === "block" && sel.id === s.id && sel.block === b.id;
                      return (
                        <li
                          key={b.id}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            dragging.current = { list: `${key}.${s.id}`, index: j };
                          }}
                          onDragOver={(e) =>
                            dragging.current?.list === `${key}.${s.id}` &&
                            (e.preventDefault(), e.stopPropagation())
                          }
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const from = dragging.current;
                            dragging.current = null;
                            if (from?.list === `${key}.${s.id}`)
                              h.change((d) => {
                                const sec = findSection(d, where, s.id);
                                if (sec) move(sec.blocks, from.index, j);
                              });
                          }}
                          className={`group flex items-center gap-1 rounded-md pr-1 text-sm ${bActive ? "bg-primary/10" : "hover:bg-surface-sunken"} ${b.disabled ? "text-fg-subtle" : ""}`}
                        >
                          <span aria-hidden className="cursor-grab px-0.5 text-fg-subtle">
                            <GripVertical className="size-3" />
                          </span>
                          <button
                            type="button"
                            onClick={() => (
                              setSel({ kind: "block", where, id: s.id, block: b.id }),
                              setMobilePanel("settings")
                            )}
                            className="min-w-0 flex-1 truncate py-1 text-left"
                          >
                            {blockLabel(def, b)}
                          </button>
                          <button
                            type="button"
                            aria-label={b.disabled ? "Show block" : "Hide block"}
                            onClick={() => toggleHidden(where, s.id, b.id)}
                            className={`rounded p-1 hover:bg-surface ${b.disabled ? "" : "opacity-0 focus:opacity-100 group-hover:opacity-100"}`}
                          >
                            {b.disabled ? (
                              <EyeOff className="size-3" />
                            ) : (
                              <Eye className="size-3" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                    <li>
                      <AddBlockMenu
                        def={def}
                        section={s}
                        onAdd={(type) => addBlock(where, s.id, type)}
                      />
                    </li>
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
        {canAdd && (
          <button
            type="button"
            onClick={() => setAdding(where)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-primary hover:bg-surface-sunken"
          >
            <Plus className="size-4" aria-hidden /> Add section
          </button>
        )}
      </div>
    );
  };

  // ── Right panel ──
  let panel: React.ReactNode = (
    <p className="text-sm text-fg-muted">
      Choose a section on the left, or click any part of the preview, to change it.
    </p>
  );
  if (sel?.kind === "section" || sel?.kind === "block") {
    const list = listOf(data, sel.where);
    const index = list.findIndex((s) => s.id === sel.id);
    const s = list[index];
    const def = s && SECTIONS[s.type];
    if (s && def) {
      const base = `${pathOf(sel.where)}.${index}`;
      if (sel.kind === "section") {
        panel = (
          <PanelFrame
            title={def.name}
            onBack={() => (setSel(null), setMobilePanel("list"))}
            actions={
              <>
                {!def.main && (
                  <>
                    <IconAction label="Move up" onClick={() => moveSel(-1)} disabled={index === 0}>
                      <ArrowUp />
                    </IconAction>
                    <IconAction
                      label="Move down"
                      onClick={() => moveSel(1)}
                      disabled={index === list.length - 1}
                    >
                      <ArrowDown />
                    </IconAction>
                    {!def.limit && (
                      <IconAction label="Duplicate section" onClick={duplicateSel}>
                        <Copy />
                      </IconAction>
                    )}
                    <IconAction label="Remove section" onClick={removeSel} danger>
                      <Trash2 />
                    </IconAction>
                  </>
                )}
              </>
            }
          >
            <SettingsForm
              fields={def.settings}
              values={s.settings}
              ctx={fieldCtx}
              errorFor={(id) => errorMap.get(`${base}.settings.${id}`)}
              onChange={(id, v) =>
                h.change((d) => {
                  const t = findSection(d, sel.where, sel.id);
                  if (t) t.settings[id] = v;
                }, `${s.id}.${id}`)
              }
            />
          </PanelFrame>
        );
      } else {
        const bi = s.blocks.findIndex((b) => b.id === sel.block);
        const b = s.blocks[bi];
        const bdef = b && def.blocks?.find((x) => x.type === b.type);
        if (b && bdef)
          panel = (
            <PanelFrame
              title={bdef.name}
              subtitle={def.name}
              onBack={() => setSel({ kind: "section", where: sel.where, id: sel.id })}
              actions={
                <>
                  <IconAction label="Move up" onClick={() => moveSel(-1)} disabled={bi === 0}>
                    <ArrowUp />
                  </IconAction>
                  <IconAction
                    label="Move down"
                    onClick={() => moveSel(1)}
                    disabled={bi === s.blocks.length - 1}
                  >
                    <ArrowDown />
                  </IconAction>
                  {!bdef.limit && (
                    <IconAction label="Duplicate block" onClick={duplicateSel}>
                      <Copy />
                    </IconAction>
                  )}
                  <IconAction label="Remove block" onClick={removeSel} danger>
                    <Trash2 />
                  </IconAction>
                </>
              }
            >
              <SettingsForm
                fields={bdef.settings}
                values={b.settings}
                ctx={fieldCtx}
                errorFor={(id) => errorMap.get(`${base}.blocks.${bi}.settings.${id}`)}
                onChange={(id, v) =>
                  h.change((d) => {
                    const t = findSection(d, sel.where, sel.id)?.blocks.find(
                      (x) => x.id === sel.block,
                    );
                    if (t) t.settings[id] = v;
                  }, `${b.id}.${id}`)
                }
              />
            </PanelFrame>
          );
      }
    }
  } else if (sel?.kind === "settings") {
    const g = GLOBAL_SETTINGS.find((x) => x.key === sel.group);
    if (g)
      panel = (
        <PanelFrame title={g.name} onBack={() => (setSel(null), setMobilePanel("list"))}>
          <SettingsForm
            fields={g.settings}
            values={data.settings}
            ctx={fieldCtx}
            errorFor={(id) => errorMap.get(`settings.${id}`)}
            onChange={(id, v) =>
              h.change((d) => {
                d.settings[id] = v;
                // Brand colors: the main schemes follow the brand color right away.
                if (
                  (id === "primary_color" || id === "auto_schemes") &&
                  d.settings.auto_schemes !== false &&
                  typeof d.settings.primary_color === "string"
                )
                  d.color_schemes = withBrandSchemes(d.color_schemes, d.settings.primary_color);
              }, `settings.${id}`)
            }
          />
          {g.key === "colors" && (
            <div className="mt-6 border-t border-border pt-5">
              <SchemeList
                schemes={data.color_schemes}
                sale={String(data.settings.sale_color)}
                auto={data.settings.auto_schemes !== false}
                onOpen={(id) => setSel({ kind: "scheme", id })}
                onAdd={() => {
                  const n = data.color_schemes.length + 1;
                  let id = `scheme-${n}`;
                  while (data.color_schemes.some((x) => x.id === id))
                    id = `scheme-${newId().slice(0, 6)}`;
                  h.change((d) =>
                    d.color_schemes.push({
                      ...structuredClone(d.color_schemes[0]!),
                      id,
                      name: `Scheme ${n}`,
                    }),
                  );
                  setSel({ kind: "scheme", id });
                }}
              />
            </div>
          )}
        </PanelFrame>
      );
  } else if (sel?.kind === "scheme") {
    const i = data.color_schemes.findIndex((x) => x.id === sel.id);
    const sc = data.color_schemes[i];
    if (sc) {
      const problems = schemeContrastProblems(
        sc,
        i === 0 ? String(data.settings.sale_color) : undefined,
      );
      panel = (
        <PanelFrame
          title={sc.name}
          subtitle="Color scheme"
          onBack={() => setSel({ kind: "settings", group: "colors" })}
          actions={
            data.color_schemes.length > 1 && i > 0 ? (
              <IconAction
                label="Delete color scheme"
                danger
                onClick={() => {
                  h.change((d) => {
                    d.color_schemes = d.color_schemes.filter((x) => x.id !== sc.id);
                    const first = d.color_schemes[0]!.id;
                    for (const s of [
                      ...d.groups.header,
                      ...d.groups.footer,
                      ...Object.values(d.templates).flat(),
                    ])
                      if (s.settings.color_scheme === sc.id) s.settings.color_scheme = first;
                  });
                  setSel({ kind: "settings", group: "colors" });
                }}
              >
                <Trash2 />
              </IconAction>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-5">
            <SettingField
              field={{ id: "name", type: "text", label: "Name", max: 40 }}
              value={sc.name}
              ctx={fieldCtx}
              onChange={(v) =>
                h.change((d) => void (d.color_schemes[i]!.name = String(v)), `${sc.id}.name`)
              }
            />
            {/^scheme-[123]$/.test(sc.id) && data.settings.auto_schemes !== false && (
              <p className="rounded-md bg-surface-sunken p-3 text-xs text-fg-muted">
                This scheme is built from your brand color. Changing a color here switches that off,
                so you choose every color yourself.
              </p>
            )}
            <SchemePreview scheme={sc} />
            {problems.length > 0 && (
              <Alert tone="warning" title="Some text may be hard to read">
                <ul className="list-disc pl-4">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Alert>
            )}
            {SCHEME_FIELDS.map((f) => (
              <SettingField
                key={f.id}
                field={{ id: f.id, type: "color", label: f.label, default: sc[f.id] }}
                value={sc[f.id]}
                ctx={fieldCtx}
                onChange={(v) =>
                  h.change((d) => {
                    d.color_schemes[i]![f.id] = String(v);
                    // Hand-picking a main scheme's color stops it following the brand color.
                    if (/^scheme-[123]$/.test(sc.id)) d.settings.auto_schemes = false;
                  }, `${sc.id}.${f.id}`)
                }
              />
            ))}
          </div>
        </PanelFrame>
      );
    }
  }

  /** "Slideshow › Slide: Use a path…" for the problems list. */
  const describe = (path: string, message: string) => {
    const m = /^(groups\.(header|footer)|templates\.(\w+))\.(\d+)(?:\.blocks\.(\d+))?/.exec(path);
    if (!m) return message;
    const where: Where = m[2]
      ? { group: m[2] as "header" | "footer" }
      : { template: m[3] as TemplateKey };
    const s = listOf(data, where)[Number(m[4])];
    const def = s && SECTIONS[s.type];
    if (!s || !def) return message;
    const b = m[5] !== undefined ? s.blocks[Number(m[5])] : undefined;
    const bname = b && def.blocks?.find((x) => x.type === b.type)?.name;
    return `${def.name}${bname ? ` › ${bname}` : ""}: ${message}`;
  };
  const goTo = (path: string) => {
    const m = /^(groups\.(header|footer)|templates\.(\w+))\.(\d+)(?:\.blocks\.(\d+))?/.exec(path);
    if (!m) {
      if (path.startsWith("settings."))
        setSel({
          kind: "settings",
          group:
            GLOBAL_SETTINGS.find((g) => g.settings.some((f) => f.id === path.split(".")[1]))?.key ??
            "typography",
        });
      return;
    }
    const where: Where = m[2]
      ? { group: m[2] as "header" | "footer" }
      : { template: m[3] as TemplateKey };
    if ("template" in where && where.template !== template) navigate(where.template);
    const s = listOf(data, where)[Number(m[4])];
    if (!s) return;
    const b = m[5] !== undefined ? s.blocks[Number(m[5])] : undefined;
    setTab("sections");
    setSel(
      b ? { kind: "block", where, id: s.id, block: b.id } : { kind: "section", where, id: s.id },
    );
    setMobilePanel("settings");
  };

  const statusText = {
    saved: "All changes saved",
    pending: "Unsaved changes",
    saving: "Saving…",
    error: "Couldn't save",
    invalid: "Fix the highlighted settings",
  }[status];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface text-fg">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/online-store" onClick={() => void saveNow()}>
            <ArrowLeft aria-hidden /> Exit
          </Link>
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold">{theme.name}</span>
          <Badge tone={theme.role === "live" ? "success" : "neutral"}>
            {theme.role === "live" ? "Live" : "Unpublished"}
          </Badge>
        </div>
        <Select
          aria-label="Page to edit"
          value={template}
          onChange={(e) => navigate(e.target.value as TemplateKey)}
          className="ml-auto w-48 lg:ml-6"
        >
          {TEMPLATE_KEYS.map((k) => (
            <option key={k} value={k}>
              {TEMPLATE_LABELS[k]}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1 lg:ml-auto">
          <IconAction label="Undo" onClick={h.undo} disabled={!h.canUndo}>
            <Undo2 />
          </IconAction>
          <IconAction label="Redo" onClick={h.redo} disabled={!h.canRedo}>
            <Redo2 />
          </IconAction>
          <IconAction
            label={inspect ? "Turn off click-to-select" : "Turn on click-to-select"}
            onClick={() => setInspect((x) => !x)}
            pressed={inspect}
          >
            <MousePointerClick />
          </IconAction>
          <IconAction
            label="Desktop preview"
            onClick={() => setDevice("desktop")}
            pressed={device === "desktop"}
          >
            <Monitor />
          </IconAction>
          <IconAction
            label="Phone preview"
            onClick={() => setDevice("mobile")}
            pressed={device === "mobile"}
          >
            <Smartphone />
          </IconAction>
          <IconAction label="Version history" onClick={() => setVersionsOpen(true)}>
            <History />
          </IconAction>
        </div>
        <span
          role="status"
          className={`hidden text-xs sm:inline ${status === "error" || status === "invalid" ? "text-danger" : "text-fg-muted"}`}
          data-testid="save-status"
        >
          {statusText}
        </span>
        <Button
          size="sm"
          onClick={() => (theme.role === "live" ? void publish() : setPublishing(true))}
          disabled={action.isPending || status === "invalid"}
        >
          {action.isPending ? "Publishing…" : "Publish"}
        </Button>
      </header>

      {/* Phone/tablet: switch between the panels. */}
      <div
        className="flex border-b border-border lg:hidden"
        role="tablist"
        aria-label="Editor panels"
      >
        {(["list", "settings", "preview"] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={mobilePanel === p}
            onClick={() => setMobilePanel(p)}
            className={`flex-1 py-2 text-sm ${mobilePanel === p ? "border-b-2 border-primary font-medium" : "text-fg-muted"}`}
          >
            {{ list: "Sections", settings: "Settings", preview: "Preview" }[p]}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: sections and theme settings */}
        <aside
          className={`w-full shrink-0 flex-col border-r border-border bg-surface lg:flex lg:w-72 ${mobilePanel === "list" ? "flex" : "hidden"}`}
        >
          <div className="flex border-b border-border" role="tablist" aria-label="Edit">
            {(["sections", "settings"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-sm ${tab === t ? "border-b-2 border-primary font-medium" : "text-fg-muted hover:text-fg"}`}
              >
                {t === "sections" ? "Sections" : "Theme settings"}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {tab === "sections" ? (
              <>
                {sectionList({ where: { group: "header" }, title: "Header" })}
                {sectionList({ where: { template }, title: TEMPLATE_LABELS[template] })}
                {sectionList({ where: { group: "footer" }, title: "Footer" })}
              </>
            ) : (
              <ul className="flex flex-col">
                {GLOBAL_SETTINGS.map((g) => (
                  <li key={g.key}>
                    <button
                      type="button"
                      onClick={() => (
                        setSel({ kind: "settings", group: g.key }),
                        setMobilePanel("settings")
                      )}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm ${sel?.kind === "settings" && sel.group === g.key ? "bg-primary/10" : "hover:bg-surface-sunken"}`}
                    >
                      {g.name}
                      <ChevronRight className="size-4 text-fg-subtle" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Middle: live preview */}
        <main
          className={`min-w-0 flex-1 flex-col bg-surface-sunken lg:flex ${mobilePanel === "preview" ? "flex" : "hidden"}`}
        >
          {!base ? (
            <div className="m-auto max-w-sm p-6 text-center text-sm text-fg-muted">
              This store has no storefront address yet, so there's nothing to preview.
            </div>
          ) : !frameSrc ? (
            <div className="m-auto text-sm text-fg-muted">Loading preview…</div>
          ) : (
            <div className="flex flex-1 justify-center overflow-auto p-3">
              <iframe
                ref={frame}
                src={frameSrc}
                title="Store preview"
                className={`h-full rounded-md border border-border bg-white shadow-sm transition-[width] ${device === "mobile" ? "w-[390px]" : "w-full"}`}
              />
            </div>
          )}
        </main>

        {/* Right: settings */}
        <aside
          className={`w-full shrink-0 overflow-y-auto border-l border-border bg-surface p-4 lg:block lg:w-80 ${mobilePanel === "settings" ? "block" : "hidden"}`}
          aria-label="Settings"
        >
          {status === "invalid" && errors.length > 0 && (
            <Alert tone="danger" title="Not saved: fix these first" className="mb-4">
              <ul className="flex flex-col gap-1" data-testid="theme-problems">
                {errors.slice(0, 5).map((e) => (
                  <li key={e.path}>
                    <button
                      type="button"
                      className="text-left underline-offset-2 hover:underline"
                      onClick={() => goTo(e.path)}
                    >
                      {describe(e.path, e.message)}
                    </button>
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          {panel}
        </aside>
      </div>

      <AddSectionDialog
        where={adding}
        onClose={() => setAdding(null)}
        onAdd={addSection}
        data={data}
      />

      <ConfirmDialog
        open={publishing}
        title={`Publish ${theme.name}?`}
        description="Shoppers will see this theme right away. Your current theme moves to the theme library."
        confirmLabel="Publish"
        pending={action.isPending}
        onConfirm={() => void publish()}
        onClose={() => setPublishing(false)}
      />

      <Dialog open={versionsOpen} onClose={() => setVersionsOpen(false)} title="Version history">
        <p className="mb-3 text-sm text-fg-muted">
          Each time this theme is published, a version is kept. Restoring puts that version back
          {theme.role === "live" ? " and publishes it." : "."}
        </p>
        {versions.isLoading ? (
          <div className="h-24 animate-pulse rounded bg-surface-sunken" />
        ) : !versions.data?.length ? (
          <p className="text-sm text-fg-muted">Not published yet.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {versions.data.map((v, i) => (
              <li key={v.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">
                  {formatDateTime(v.created_at)}
                  {v.created_by && <span className="text-fg-muted"> · {v.created_by}</span>}
                  {i === 0 && (
                    <Badge tone="info" className="ml-2">
                      Latest
                    </Badge>
                  )}
                </span>
                {i > 0 && (
                  <Button size="sm" variant="secondary" onClick={() => setRestoring(v.id)}>
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!restoring}
        title="Restore this version?"
        description={
          theme.role === "live"
            ? "Your store goes back to how it looked then. Unpublished changes are replaced."
            : "The theme goes back to how it looked then. Unpublished changes are replaced."
        }
        confirmLabel="Restore"
        pending={action.isPending}
        onConfirm={() => restoring && restore(restoring)}
        onClose={() => setRestoring(null)}
      />
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  danger,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`flex size-8 items-center justify-center rounded-md disabled:opacity-40 [&>svg]:size-4 ${pressed ? "bg-primary/10 text-primary" : "hover:bg-surface-sunken"} ${danger ? "text-danger" : ""}`}
    >
      {children}
    </button>
  );
}

function PanelFrame({
  title,
  subtitle,
  onBack,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <IconAction label="Back" onClick={onBack}>
          <ArrowLeft />
        </IconAction>
        <div className="min-w-0 flex-1">
          {subtitle && <p className="text-xs text-fg-muted">{subtitle}</p>}
          <h2 className="truncate font-semibold">{title}</h2>
        </div>
        <div className="flex items-center">{actions}</div>
      </div>
      {children}
    </div>
  );
}

function AddBlockMenu({
  def,
  section,
  onAdd,
}: {
  def: SectionDef;
  section: SectionInstance;
  onAdd: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const full = section.blocks.length >= (def.max_blocks ?? 50);
  const available = (def.blocks ?? []).filter(
    (b) => !b.limit || section.blocks.filter((x) => x.type === b.type).length < b.limit,
  );
  if (full || !available.length) return null;
  if (available.length === 1)
    return (
      <button
        type="button"
        onClick={() => onAdd(available[0]!.type)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-surface-sunken"
      >
        <Plus className="size-3.5" aria-hidden /> Add {available[0]!.name.toLowerCase()}
      </button>
    );
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-surface-sunken"
      >
        <Plus className="size-3.5" aria-hidden /> Add block
      </button>
      {open && (
        <ul className="absolute left-0 top-full z-10 mt-1 w-52 rounded-md border border-border bg-surface p-1 shadow-lg">
          {available.map((b) => (
            <li key={b.type}>
              <button
                type="button"
                onClick={() => (setOpen(false), onAdd(b.type))}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-surface-sunken"
              >
                {b.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  banner: "Banners",
  products: "Products and collections",
  text: "Text and content",
  media: "Media",
  layout: "Layout",
  header: "Header",
  footer: "Footer",
};

function AddSectionDialog({
  where,
  onClose,
  onAdd,
  data,
}: {
  where: Where | null;
  onClose: () => void;
  onAdd: (w: Where, type: string) => void;
  data: ThemeData;
}) {
  const [q, setQ] = useState("");
  const list = where ? listOf(data, where) : [];
  const defs = where
    ? SECTION_DEFS.filter(
        (d) =>
          canAddTo(d, "group" in where ? { group: where.group } : { template: where.template }) &&
          (!d.limit || list.filter((s) => s.type === d.type).length < d.limit) &&
          (!q || d.name.toLowerCase().includes(q.toLowerCase())),
      )
    : [];
  const cats = [...new Set(defs.map((d) => d.category))];
  return (
    <Dialog open={!!where} onClose={onClose} title="Add section">
      <div className="flex flex-col gap-3">
        <Input
          aria-label="Search sections"
          placeholder="Search sections"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {defs.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">Nothing more can be added here.</p>
        ) : (
          <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
            {cats.map((c) => (
              <div key={c}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                  {CATEGORY_LABELS[c] ?? c}
                </p>
                <ul className="grid grid-cols-2 gap-2">
                  {defs
                    .filter((d) => d.category === c)
                    .map((d) => (
                      <li key={d.type}>
                        <button
                          type="button"
                          onClick={() => where && (setQ(""), onAdd(where, d.type))}
                          className="w-full rounded-md border border-border px-3 py-2.5 text-left text-sm hover:border-primary hover:bg-primary/5"
                        >
                          {d.name}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function SchemePreview({ scheme: s }: { scheme: ColorScheme }) {
  return (
    <div
      className="rounded-md border p-4"
      style={{ background: s.background, color: s.text, borderColor: s.border }}
    >
      <p className="text-lg font-semibold">Heading</p>
      <p className="text-sm" style={{ color: s.muted }}>
        Secondary text looks like this.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <span
          className="rounded px-3 py-1.5 text-sm font-medium"
          style={{ background: s.accent, color: s.accent_text }}
        >
          Button
        </span>
        <span className="rounded px-3 py-1.5 text-sm" style={{ background: s.surface }}>
          Card
        </span>
      </div>
    </div>
  );
}

function SchemeList({
  schemes,
  sale,
  auto,
  onOpen,
  onAdd,
}: {
  schemes: ColorScheme[];
  sale: string;
  auto: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <p className="text-sm font-medium">Color schemes</p>
      <p className="text-xs text-fg-muted">
        {auto
          ? "Built from your brand color: Light, Soft and Brand. Each section picks one."
          : "Each section picks one. The first is used for the page background."}
      </p>
      <ul className="flex flex-col gap-2">
        {schemes.map((s, i) => {
          const issues = schemeContrastProblems(s, i === 0 ? sale : undefined).length;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                className="flex w-full items-center gap-3 rounded-md border border-border p-2 text-left text-sm hover:border-border-strong"
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded border text-xs font-semibold"
                  style={{ background: s.background, color: s.text, borderColor: s.border }}
                >
                  Aa
                </span>
                <span className="flex-1 truncate">{s.name}</span>
                {issues > 0 && <Badge tone="warning">Low contrast</Badge>}
                <span
                  className="size-4 rounded-full"
                  style={{ background: s.accent }}
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>
      {schemes.length < MAX_SCHEMES && (
        <Button size="sm" variant="secondary" onClick={onAdd}>
          <Plus aria-hidden /> Add color scheme
        </Button>
      )}
    </div>
  );
}
