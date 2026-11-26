import { ArrowRight } from "lucide-react";
import { SIGNUP_URL } from "@/lib/site";

/**
 * "Enter your email → Start for free". A plain GET form to the app's sign-up
 * page, which fills in the email (works without JavaScript).
 */
export function SignupForm({
  id,
  tone = "dark",
  note = "Free during beta. No credit card needed.",
}: {
  id: string;
  tone?: "dark" | "light";
  note?: string;
}) {
  const onDark = tone === "dark";
  return (
    <div className="w-full max-w-xl">
      <form
        action={SIGNUP_URL}
        method="get"
        className={`flex flex-col gap-2 rounded-2xl p-2 sm:flex-row sm:rounded-full ${onDark ? "bg-white/10 ring-1 ring-white/15" : "bg-paper ring-1 ring-line"}`}
      >
        <label htmlFor={id} className="sr-only">
          Email address
        </label>
        <input
          id={id}
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="Enter your email address"
          className={`min-w-0 flex-1 rounded-full bg-transparent px-4 py-3 text-base outline-none ${onDark ? "text-white placeholder:text-fg-inverse-muted" : "text-fg placeholder:text-fg-muted"}`}
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-ember px-6 py-3 text-base font-semibold text-white hover:bg-ember-hover"
        >
          Start for free <ArrowRight aria-hidden className="size-4" />
        </button>
      </form>
      {note && (
        <p className={`mt-3 text-sm ${onDark ? "text-fg-inverse-muted" : "text-fg-muted"}`}>
          {note}
        </p>
      )}
    </div>
  );
}
