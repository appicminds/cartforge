"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@cartforge/ui";

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep focus (and the selection) in the editor on mouse clicks so the
      // command applies immediately; keyboard activation still works normally.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-sunken hover:text-fg disabled:opacity-40 [&_svg]:size-4",
        active && "bg-surface-sunken text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  const editLink = () => {
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
    // TODO(Sprint 4 polish): replace prompt with an inline popover.
    const url = window.prompt("Link URL (https://, mailto:, or /path)", prev);
    if (url === null) return;
    if (url.trim() === "") chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap gap-0.5 border-b border-border p-1"
    >
      <ToolButton
        label="Bold"
        active={s.bold}
        disabled={disabled}
        onClick={() => chain().toggleBold().run()}
      >
        <Bold />
      </ToolButton>
      <ToolButton
        label="Italic"
        active={s.italic}
        disabled={disabled}
        onClick={() => chain().toggleItalic().run()}
      >
        <Italic />
      </ToolButton>
      <span aria-hidden className="mx-1 my-1.5 w-px bg-border" />
      <ToolButton
        label="Heading"
        active={s.h2}
        disabled={disabled}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 />
      </ToolButton>
      <ToolButton
        label="Subheading"
        active={s.h3}
        disabled={disabled}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 />
      </ToolButton>
      <ToolButton
        label="Bulleted list"
        active={s.bullet}
        disabled={disabled}
        onClick={() => chain().toggleBulletList().run()}
      >
        <List />
      </ToolButton>
      <ToolButton
        label="Numbered list"
        active={s.ordered}
        disabled={disabled}
        onClick={() => chain().toggleOrderedList().run()}
      >
        <ListOrdered />
      </ToolButton>
      <ToolButton
        label="Quote"
        active={s.quote}
        disabled={disabled}
        onClick={() => chain().toggleBlockquote().run()}
      >
        <Quote />
      </ToolButton>
      <ToolButton label="Link" active={s.link} disabled={disabled} onClick={editLink}>
        <Link2 />
      </ToolButton>
      <span aria-hidden className="mx-1 my-1.5 w-px bg-border" />
      <ToolButton
        label="Undo"
        disabled={disabled || !s.canUndo}
        onClick={() => chain().undo().run()}
      >
        <Undo2 />
      </ToolButton>
      <ToolButton
        label="Redo"
        disabled={disabled || !s.canRedo}
        onClick={() => chain().redo().run()}
      >
        <Redo2 />
      </ToolButton>
    </div>
  );
}

/**
 * Description editor (PRD §8.4 A). Output is sanitized again by the API — the
 * editor's own schema is a convenience, not a security boundary.
 */
export default function RichTextEditor({
  value,
  onChange,
  onBlur,
  labelledBy,
  describedBy,
  invalid,
  disabled,
}: RichTextEditorProps) {
  // Last value this editor emitted. Lets the sync effect tell its own (possibly
  // lagging) echo apart from a genuine external change such as Discard.
  const emitted = useRef(value);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, protocols: ["mailto", "tel"] },
        underline: false,
        codeBlock: false,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelledBy,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        class: "cf-prose min-h-40 px-3 py-2 text-sm outline-none",
      },
    },
    onUpdate: ({ editor: e }) => {
      const html = e.isEmpty ? "" : e.getHTML();
      emitted.current = html;
      onChange(html);
    },
    onBlur: () => onBlur?.(),
  });

  // Apply external changes only (Discard, server reset) — never re-apply our own
  // emitted value, which would clobber keystrokes typed since that render.
  useEffect(() => {
    if (!editor || value === emitted.current) return;
    emitted.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div
      className={cn(
        "rounded-md border border-border-strong bg-surface shadow-sm focus-within:border-focus focus-within:outline-2 focus-within:outline-focus/30",
        invalid && "border-danger",
      )}
    >
      {editor ? (
        <Toolbar editor={editor} disabled={disabled} />
      ) : (
        <div className="h-10 border-b border-border" />
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
