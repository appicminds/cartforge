"use client";

import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import {
  forgot,
  login,
  register,
  resetPassword,
  saveAddress,
  updateProfile,
} from "@/app/actions/account";
import { AddressFields, Field, FormMessage } from "@/components/checkout/fields";
import { SubmitButton } from "@/components/submit-button";
import type { CommerceAddress, FormState, StorefrontCustomer } from "@/lib/commerce-types";

/** Submit through the action without React resetting the fields (keeps typed values on errors). */
function useKeep(action: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

function Notice({ state }: { state: FormState }) {
  if (!state.message) return null;
  return state.done ? (
    <p role="status" className="rounded-[var(--sf-radius)] border border-line p-3 text-sm">
      {state.message}
    </p>
  ) : (
    <FormMessage message={state.message} />
  );
}

const PASSWORD_HINT = "At least 12 characters, with a number or symbol.";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(login, {});
  return (
    <form action={action} onSubmit={useKeep(action)} noValidate className="flex flex-col gap-4">
      <Notice state={state} />
      <input type="hidden" name="next" value={next} />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        errors={state.errors}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        errors={state.errors}
      />
      <SubmitButton pending={pending} className="sf-button w-full">
        Sign in
      </SubmitButton>
      <p className="text-sm">
        <Link href="/account/forgot" className="underline underline-offset-2">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(register, {});
  const onSubmit = useKeep(action);
  if (state.done) return <Notice state={state} />;
  return (
    <form action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Notice state={state} />
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="first_name"
          label="First name"
          autoComplete="given-name"
          errors={state.errors}
        />
        <Field
          name="last_name"
          label="Last name"
          autoComplete="family-name"
          errors={state.errors}
        />
      </div>
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        errors={state.errors}
      />
      <div>
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          errors={state.errors}
        />
        <p className="mt-1 text-sm text-muted">{PASSWORD_HINT}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="accepts_marketing" className="accent-[var(--sf-accent)]" />
        Email me about new products and offers
      </label>
      <SubmitButton pending={pending} className="sf-button w-full">
        Create account
      </SubmitButton>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgot, {});
  const onSubmit = useKeep(action);
  if (state.done) return <Notice state={state} />;
  return (
    <form action={action} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Notice state={state} />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        errors={state.errors}
      />
      <SubmitButton pending={pending} className="sf-button w-full">
        Send link
      </SubmitButton>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <form action={action} onSubmit={useKeep(action)} noValidate className="flex flex-col gap-4">
      <Notice state={state} />
      <input type="hidden" name="token" value={token} />
      <div>
        <Field
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          errors={state.errors}
        />
        <p className="mt-1 text-sm text-muted">{PASSWORD_HINT}</p>
      </div>
      <SubmitButton pending={pending} className="sf-button w-full">
        Save password
      </SubmitButton>
    </form>
  );
}

export function ProfileForm({ customer }: { customer: StorefrontCustomer }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, {});
  return (
    <form action={action} onSubmit={useKeep(action)} noValidate className="flex flex-col gap-4">
      <Notice state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="first_name"
          label="First name"
          autoComplete="given-name"
          defaultValue={customer.first_name}
          errors={state.errors}
        />
        <Field
          name="last_name"
          label="Last name"
          autoComplete="family-name"
          defaultValue={customer.last_name}
          errors={state.errors}
        />
      </div>
      <Field
        name="phone"
        label="Phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        defaultValue={customer.phone}
        errors={state.errors}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="accepts_marketing"
          defaultChecked={customer.accepts_marketing}
          className="accent-[var(--sf-accent)]"
        />
        Email me about new products and offers
      </label>
      <SubmitButton pending={pending} className="sf-button self-start">
        Save details
      </SubmitButton>
    </form>
  );
}

export function AddressForm({
  id,
  value,
  isDefault,
  countries,
  locale,
}: {
  id?: string;
  value: CommerceAddress | null;
  isDefault: boolean;
  countries: string[] | null;
  locale?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAddress, {});
  return (
    <form action={action} onSubmit={useKeep(action)} noValidate className="flex flex-col gap-6">
      <Notice state={state} />
      {id && <input type="hidden" name="id" value={id} />}
      <AddressFields
        prefix="shipping_address"
        value={value}
        countries={countries}
        errors={state.errors}
        locale={locale}
        withPhone
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_default"
          defaultChecked={isDefault}
          className="accent-[var(--sf-accent)]"
        />
        Use as my default address
      </label>
      <SubmitButton pending={pending} className="sf-button self-start">
        Save address
      </SubmitButton>
    </form>
  );
}
