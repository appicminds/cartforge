"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { CurrentUser, DetailResponse } from "@cartforge/types";
import { Alert, Button, Field, Input, Select, Spinner } from "@cartforge/ui";
import { handleFromName, signupSchema, type SignupInput } from "@cartforge/validation";
import { apiRequest } from "@/lib/api-client";
import { applyServerErrors } from "@/lib/forms";
import { CURRENCIES, useHandleCheck, usePlatformConfig } from "@/lib/platform";
import { meQueryKey } from "@/lib/session";
import { useDebounced } from "@/lib/use-debounced";

const STORE_KEY = "cf:active-store";

export function SignupForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const config = usePlatformConfig();
  const [formError, setFormError] = useState<string | null>(null);
  const [handleTouched, setHandleTouched] = useState(false);
  const form = useForm<SignupInput>({
    // An empty address means "derive it from the store name" (the server does the same).
    resolver: (values, ctx, opts) =>
      zodResolver(signupSchema)({ ...values, handle: values.handle || undefined }, ctx, opts),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      store_name: "",
      handle: "",
      currency: "USD",
    },
  });
  const { errors } = form.formState;
  // Coming from the marketing site's "Enter your email" box: start with it filled in.
  useEffect(() => {
    const email = new URLSearchParams(window.location.search).get("email")?.trim();
    if (email && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      form.setValue("email", email);
  }, [form]);
  const storeName = form.watch("store_name");
  const handleValue = form.watch("handle") ?? "";
  const effectiveHandle = handleTouched
    ? handleValue
    : storeName.trim().length >= 2
      ? handleFromName(storeName)
      : "";
  const check = useHandleCheck(useDebounced(effectiveHandle, 300));

  const signup = useMutation({
    mutationFn: (input: SignupInput) =>
      apiRequest<DetailResponse<CurrentUser>>("/auth/signup", { method: "POST", body: input }),
    onSuccess: (res) => {
      qc.setQueryData(meQueryKey, res.data);
      const first = res.data.stores[0];
      try {
        if (first) localStorage.setItem(STORE_KEY, first.store_id);
      } catch {
        /* storage unavailable */
      }
      router.replace("/admin");
    },
    onError: (err) =>
      setFormError(
        applyServerErrors(err, form.setError, [
          "name",
          "email",
          "password",
          "store_name",
          "handle",
          "currency",
        ]),
      ),
  });

  if (config.isPending) return <Spinner className="mt-6 size-5" label="Loading" />;
  if (config.data && !config.data.signup_enabled) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <Alert tone="info" title="Sign-up is closed">
          New stores are created by the administrator of this installation.
        </Alert>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }
  const domain = config.data?.platform_domain;

  return (
    <form
      noValidate
      className="mt-6 flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        setFormError(null);
        signup.mutate({ ...values, handle: effectiveHandle || undefined });
      })}
    >
      {formError && <Alert tone="danger" title={formError} />}
      <Field label="Your name" error={errors.name?.message} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            autoComplete="name"
            aria-describedby={describedBy}
            invalid={invalid}
            {...form.register("name")}
          />
        )}
      </Field>
      <Field label="Email" error={errors.email?.message} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="email"
            autoComplete="email"
            aria-describedby={describedBy}
            invalid={invalid}
            {...form.register("email")}
          />
        )}
      </Field>
      <Field
        label="Password"
        error={errors.password?.message}
        required
        hint="At least 12 characters, with a number or symbol."
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            invalid={invalid}
            {...form.register("password")}
          />
        )}
      </Field>
      <Field label="Store name" error={errors.store_name?.message} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            autoComplete="organization"
            aria-describedby={describedBy}
            invalid={invalid}
            {...form.register("store_name")}
          />
        )}
      </Field>
      {domain && (
        <Field
          label="Store address"
          error={
            errors.handle?.message ??
            (check.data && !check.data.available ? (check.data.reason ?? undefined) : undefined)
          }
          hint={
            check.data?.available
              ? `Available — https://${effectiveHandle}.${domain}`
              : `Your store will live at <address>.${domain}`
          }
        >
          {({ id, describedBy, invalid }) => (
            <div className="flex items-center gap-2">
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid || (check.data ? !check.data.available : false)}
                value={effectiveHandle}
                onChange={(e) => {
                  setHandleTouched(true);
                  form.setValue("handle", e.target.value.toLowerCase());
                }}
              />
              <span className="shrink-0 text-sm text-fg-muted">.{domain}</span>
            </div>
          )}
        </Field>
      )}
      <Field label="Currency" hint="You can't change this after your first order.">
        {({ id, describedBy }) => (
          <Select id={id} aria-describedby={describedBy} {...form.register("currency")}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button
        type="submit"
        size="lg"
        loading={signup.isPending || signup.isSuccess}
        className="mt-2 w-full"
      >
        Create store
      </Button>
      <p className="text-center text-sm text-fg-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-primary underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}
