/** Centered card used by sign-in, password reset and similar signed-out pages. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-fg"
          >
            C
          </span>
          <span className="text-xl font-semibold tracking-tight">CartForge</span>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6 shadow-md sm:p-8">
          <h1 className="text-xl font-semibold">{title}</h1>
          {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
          {children}
        </div>
        {footer}
      </div>
    </main>
  );
}
