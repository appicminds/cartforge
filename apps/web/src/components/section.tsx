import { Check } from "lucide-react";

/** A small label above a section heading. */
export function Eyebrow({
  children,
  tone = "light",
}: {
  children: React.ReactNode;
  tone?: "light" | "dark";
}) {
  return (
    <p
      className={`text-sm font-semibold uppercase tracking-[0.14em] ${tone === "dark" ? "text-ember-bright" : "text-ember"}`}
    >
      {children}
    </p>
  );
}

export function Points({
  items,
  tone = "light",
}: {
  items: { title: string; text: string }[];
  tone?: "light" | "dark";
}) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {items.map((p) => (
        <li key={p.title} className="flex gap-3">
          <span
            aria-hidden
            className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${tone === "dark" ? "bg-ember-bright/15 text-ember-bright" : "bg-ember-soft text-ember"}`}
          >
            <Check className="size-4" />
          </span>
          <span>
            <span className="block font-semibold">{p.title}</span>
            <span
              className={`block text-[15px] ${tone === "dark" ? "text-fg-inverse-muted" : "text-fg-muted"}`}
            >
              {p.text}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
