import type { CartNotice } from "@/lib/commerce-types";

export function CartNotices({ notices }: { notices: CartNotice[] }) {
  if (!notices.length) return null;
  return (
    <div
      role="status"
      className="rounded-[var(--sf-radius)] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <p className="font-semibold">Your cart was updated</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {notices.map((n, i) => (
          <li key={`${n.kind}-${n.line_id}-${i}`}>{n.message}</li>
        ))}
      </ul>
    </div>
  );
}
