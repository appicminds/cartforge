"use client";

import { useActionState } from "react";
import { applyDiscount } from "@/app/actions/checkout";
import type { FormState } from "@/lib/commerce-types";

/** "Discount code" box in the order summary; shows the applied code with Remove. */
export function DiscountForm({ code, note }: { code: string | null; note: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(applyDiscount, {});
  const error = state.errors?.discount_code ?? state.message;
  if (code)
    return (
      <form
        action={action}
        className="mt-4 flex flex-col gap-1 text-sm"
        data-testid="discount-applied"
      >
        <input type="hidden" name="remove" value="1" />
        <div className="flex items-center justify-between gap-3">
          <span>
            Code <strong className="tracking-wide">{code}</strong>
          </span>
          <button type="submit" className="sf-link" disabled={pending}>
            Remove<span className="sr-only"> code {code}</span>
          </button>
        </div>
        {note && (
          <p role="status" className="text-muted">
            {note}
          </p>
        )}
      </form>
    );
  return (
    <form action={action} className="mt-4 flex flex-col gap-1" noValidate>
      <div className="flex gap-2">
        <label htmlFor="discount-code" className="sr-only">
          Discount code
        </label>
        <input
          id="discount-code"
          name="discount_code"
          placeholder="Discount code"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "discount-code-err" : undefined}
          className="sf-field w-0 min-w-0 flex-1 uppercase"
        />
        <button type="submit" className="sf-button px-4" disabled={pending}>
          {pending ? "Applying…" : "Apply"}
        </button>
      </div>
      {error && (
        <p id="discount-code-err" role="alert" className="text-sm text-sale">
          {error}
        </p>
      )}
    </form>
  );
}
