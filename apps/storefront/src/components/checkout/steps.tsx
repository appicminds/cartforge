"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { placeOrder, saveInformation, saveShipping } from "@/app/actions/checkout";
import type { CheckoutView, FormState } from "@/lib/commerce-types";
import { formatMoney } from "@/lib/money";
import { SubmitButton } from "../submit-button";
import { AddressFields, Field, FieldError, FormMessage } from "./fields";

/**
 * React resets a form after a form action runs, which would wipe the shopper's
 * entries whenever the server reports a validation error. With JavaScript we
 * submit through the action ourselves (no reset); without it the form's
 * `action` still posts natively.
 */
function useKeepValues(action: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

export function InformationStep({ view, locale }: { view: CheckoutView; locale?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveInformation, {});
  const onSubmit = useKeepValues(action);
  const ships = view.shipping_required;
  return (
    <form action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <input type="hidden" name="ships" value={ships ? "1" : "0"} />
      <FormMessage message={state.message} />
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-xl font-semibold">Contact</legend>
        <Field
          name="email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={view.email}
          errors={state.errors}
          required
        />
        {view.phone_mode !== "hidden" && (
          <Field
            name="phone"
            label="Phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={view.phone}
            errors={state.errors}
            required={view.phone_mode === "required"}
          />
        )}
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-xl font-semibold">
          {ships ? "Shipping address" : "Billing address"}
        </legend>
        <AddressFields
          prefix={ships ? "shipping_address" : "billing_address"}
          value={ships ? view.shipping_address : view.billing_address}
          countries={ships ? view.shipping_countries : null}
          errors={state.errors}
          locale={locale}
        />
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/cart" className="sf-link text-sm">
          Return to cart
        </Link>
        <SubmitButton className="sf-button" pending={pending} pendingLabel="Saving…">
          {ships ? "Continue to shipping" : "Continue to payment"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function ShippingStep({ view, locale }: { view: CheckoutView; locale?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveShipping, {});
  const onSubmit = useKeepValues(action);
  const money = (m: number) => formatMoney(m, view.cart.currency, locale);
  const selected = view.shipping_method_id ?? view.shipping_options[0]?.id;
  const err = state.errors?.shipping_method_id;
  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-8">
      <FormMessage message={state.message} />
      <fieldset aria-describedby={err ? "ship-err" : undefined}>
        <legend className="mb-3 text-xl font-semibold">Shipping method</legend>
        {view.shipping_options.length === 0 ? (
          <p className="rounded-[var(--sf-radius)] border border-line p-4 text-sm text-muted">
            We can’t ship to this address yet. Please use a different address.
          </p>
        ) : (
          <div className="divide-y divide-line rounded-[var(--sf-radius)] border border-line">
            {view.shipping_options.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-start gap-3 p-4 has-[:checked]:bg-surface"
              >
                <input
                  type="radio"
                  name="shipping_method_id"
                  value={o.id}
                  defaultChecked={o.id === selected}
                  className="mt-1 accent-[var(--sf-accent)]"
                />
                <span className="flex-1">
                  <span className="block font-medium">{o.name}</span>
                  {o.description && (
                    <span className="block text-sm text-muted">{o.description}</span>
                  )}
                </span>
                <span className="font-medium">
                  {o.price_minor === 0 ? (o.free ? "Free" : "Free") : money(o.price_minor)}
                </span>
              </label>
            ))}
          </div>
        )}
        <FieldError id="ship-err" message={err} />
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/checkout?step=information" className="sf-link text-sm">
          Return to information
        </Link>
        <SubmitButton
          className="sf-button"
          pending={pending}
          disabled={!view.shipping_options.length}
          pendingLabel="Saving…"
        >
          Continue to payment
        </SubmitButton>
      </div>
    </form>
  );
}

export function PaymentStep({
  view,
  locale,
  idempotencyKey,
}: {
  view: CheckoutView;
  locale?: string;
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(placeOrder, {});
  const onSubmit = useKeepValues(action);
  const [billing, setBilling] = useState(view.billing_same_as_shipping ? "same" : "different");
  const money = (m: number) => formatMoney(m, view.cart.currency, locale);
  const errors = state.errors ?? {};
  const checkboxes = view.custom_fields.filter((f) => f.type === "checkbox").map((f) => f.key);
  const selectedPayment = view.payment_method ?? view.payment_options[0]?.key;
  return (
    <form action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <input type="hidden" name="expected_total" value={view.totals.total_minor} />
      <input type="hidden" name="ships" value={view.shipping_required ? "1" : "0"} />
      <input type="hidden" name="custom_checkboxes" value={checkboxes.join(",")} />
      <FormMessage message={state.message} />

      <fieldset aria-describedby={errors.payment_method ? "pay-err" : undefined}>
        <legend className="mb-1 text-xl font-semibold">Payment</legend>
        <p className="mb-3 text-sm text-muted">
          All transactions are secure. No card details are collected here.
        </p>
        {view.payment_options.length === 0 ? (
          <p className="rounded-[var(--sf-radius)] border border-line p-4 text-sm text-muted">
            This store isn’t accepting orders right now.
          </p>
        ) : (
          <div className="divide-y divide-line rounded-[var(--sf-radius)] border border-line">
            {view.payment_options.map((p) => (
              <label
                key={p.key}
                className="flex cursor-pointer items-start gap-3 p-4 has-[:checked]:bg-surface"
              >
                <input
                  type="radio"
                  name="payment_method"
                  value={p.key}
                  defaultChecked={p.key === selectedPayment}
                  className="mt-1 accent-[var(--sf-accent)]"
                />
                <span>
                  <span className="block font-medium">{p.label}</span>
                  <span className="block text-sm text-muted">{p.description}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        <FieldError id="pay-err" message={errors.payment_method} />
      </fieldset>

      {view.shipping_required && (
        <fieldset>
          <legend className="mb-3 text-xl font-semibold">Billing address</legend>
          <div className="divide-y divide-line rounded-[var(--sf-radius)] border border-line">
            {[
              ["same", "Same as shipping address"],
              ["different", "Use a different billing address"],
            ].map(([v, label]) => (
              <label
                key={v}
                className="flex cursor-pointer items-center gap-3 p-4 has-[:checked]:bg-surface"
              >
                <input
                  type="radio"
                  name="billing"
                  value={v}
                  checked={billing === v}
                  onChange={() => setBilling(v!)}
                  className="accent-[var(--sf-accent)]"
                />
                {label}
              </label>
            ))}
          </div>
          {billing === "different" && (
            <div className="mt-4">
              <AddressFields
                prefix="billing_address"
                value={view.billing_address}
                countries={null}
                errors={errors}
                locale={locale}
              />
            </div>
          )}
        </fieldset>
      )}

      {view.custom_fields.length > 0 && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-xl font-semibold">Additional details</legend>
          {view.custom_fields.map((f) => {
            const name = `custom.${f.key}`;
            const err = errors[`custom_fields.${f.key}`];
            const id = `cf-${f.key}`;
            const value = view.custom_field_values[f.key];
            const described =
              [f.help && `${id}-help`, err && `${id}-err`].filter(Boolean).join(" ") || undefined;
            return (
              <div key={f.key}>
                {f.type === "checkbox" ? (
                  <label className="flex items-start gap-3">
                    <input
                      id={id}
                      type="checkbox"
                      name={name}
                      defaultChecked={value === true}
                      aria-describedby={described}
                      aria-invalid={err ? true : undefined}
                      className="mt-1 accent-[var(--sf-accent)]"
                    />
                    <span>
                      {f.label}
                      {!f.required && <span className="text-muted"> (optional)</span>}
                    </span>
                  </label>
                ) : (
                  <>
                    <label htmlFor={id} className="mb-1 block text-sm">
                      {f.label}
                      {!f.required && <span className="text-muted"> (optional)</span>}
                    </label>
                    {f.type === "select" ? (
                      <select
                        id={id}
                        name={name}
                        defaultValue={typeof value === "string" ? value : ""}
                        aria-describedby={described}
                        aria-invalid={err ? true : undefined}
                        className="sf-field sf-select w-full"
                      >
                        <option value="">Choose…</option>
                        {f.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea
                        id={id}
                        name={name}
                        rows={3}
                        defaultValue={typeof value === "string" ? value : ""}
                        aria-describedby={described}
                        aria-invalid={err ? true : undefined}
                        className="sf-field w-full"
                      />
                    ) : (
                      <input
                        id={id}
                        name={name}
                        defaultValue={typeof value === "string" ? value : ""}
                        aria-describedby={described}
                        aria-invalid={err ? true : undefined}
                        className="sf-field w-full"
                      />
                    )}
                  </>
                )}
                {f.help && (
                  <p id={`${id}-help`} className="mt-1 text-sm text-muted">
                    {f.help}
                  </p>
                )}
                <FieldError id={`${id}-err`} message={err} />
              </div>
            );
          })}
        </fieldset>
      )}

      {view.terms && (
        <div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="terms"
              defaultChecked={view.terms_accepted}
              aria-describedby={errors.terms ? "terms-err" : undefined}
              aria-invalid={errors.terms ? true : undefined}
              className="mt-1 accent-[var(--sf-accent)]"
            />
            <span>
              {view.terms.label}
              {view.terms.url && (
                <>
                  {" "}
                  (
                  <a
                    href={view.terms.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sf-link"
                  >
                    read the terms
                  </a>
                  )
                </>
              )}
            </span>
          </label>
          <FieldError id="terms-err" message={errors.terms} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href={view.shipping_required ? "/checkout?step=shipping" : "/checkout?step=information"}
          className="sf-link text-sm"
        >
          Return to {view.shipping_required ? "shipping" : "information"}
        </Link>
        <SubmitButton
          className="sf-button min-w-56"
          pending={pending}
          disabled={!view.payment_options.length}
          pendingLabel="Placing your order…"
        >
          Place order · {money(view.totals.total_minor)}
        </SubmitButton>
      </div>
    </form>
  );
}
