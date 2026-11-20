"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { CurrentUser, DetailResponse, MfaChallenge } from "@cartforge/types";
import { Alert, Button, Field, Input } from "@cartforge/ui";
import { loginSchema, type LoginInput } from "@cartforge/validation";
import { ApiError, apiRequest } from "@/lib/api-client";
import { applyServerErrors } from "@/lib/forms";
import { meQueryKey } from "@/lib/session";

/** Only allow same-site relative redirects after login (no open redirect). */
function safeNext(next: string | null): string {
  return next && /^\/(admin|invite)(\/|\?|$)/.test(next) && !next.startsWith("//")
    ? next
    : "/admin";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const signedIn = (user: CurrentUser) => {
    qc.setQueryData(meQueryKey, user);
    router.replace(safeNext(params.get("next")));
  };

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors } = form.formState;

  const login = useMutation({
    mutationFn: (input: LoginInput) =>
      apiRequest<DetailResponse<CurrentUser | MfaChallenge>>("/auth/login", {
        method: "POST",
        body: input,
      }),
    onSuccess: (res) => {
      if ("mfa_required" in res.data) setMfaToken(res.data.mfa_token);
      else signedIn(res.data);
    },
    onError: (err) => setFormError(applyServerErrors(err, form.setError, ["email", "password"])),
  });

  if (mfaToken)
    return (
      <MfaStep
        token={mfaToken}
        onSignedIn={signedIn}
        onRestart={() => {
          setMfaToken(null);
          form.setValue("password", "");
        }}
      />
    );

  return (
    <form
      noValidate
      className="mt-6 flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        setFormError(null);
        login.mutate(values);
      })}
    >
      {formError && <Alert tone="danger" title={formError} />}
      <Field label="Email" error={errors.email?.message} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="email"
            autoComplete="username"
            autoFocus
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
        hint={
          <Link href="/forgot-password" className="text-primary underline underline-offset-2">
            Forgot password?
          </Link>
        }
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="password"
            autoComplete="current-password"
            aria-describedby={describedBy}
            invalid={invalid}
            {...form.register("password")}
          />
        )}
      </Field>
      <Button
        type="submit"
        size="lg"
        loading={login.isPending || login.isSuccess}
        className="mt-2 w-full"
      >
        Sign in
      </Button>
    </form>
  );
}

/** Second step for accounts with two-factor sign-in. */
function MfaStep({
  token,
  onSignedIn,
  onRestart,
}: {
  token: string;
  onSignedIn: (user: CurrentUser) => void;
  onRestart: () => void;
}) {
  const [code, setCode] = useState("");
  const verify = useMutation({
    mutationFn: () =>
      apiRequest<DetailResponse<CurrentUser>>("/auth/login/mfa", {
        method: "POST",
        body: { mfa_token: token, code },
      }),
    onSuccess: (res) => onSignedIn(res.data),
  });
  const expired = verify.error instanceof ApiError && verify.error.status === 401;
  const fieldError =
    verify.error instanceof ApiError && !expired
      ? (verify.error.fields.find((f) => f.path === "code")?.message ?? verify.error.message)
      : undefined;

  return (
    <form
      noValidate
      className="mt-6 flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        verify.mutate();
      }}
    >
      {expired ? (
        <Alert tone="warning" title={verify.error?.message ?? "Sign-in expired"}>
          <button type="button" className="underline underline-offset-2" onClick={onRestart}>
            Start again
          </button>
        </Alert>
      ) : (
        <p className="text-sm text-fg-muted">
          Enter the 6-digit code from your authenticator app. Lost your phone? Use one of your
          recovery codes instead.
        </p>
      )}
      <Field label="Authentication code" error={fieldError} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            autoComplete="one-time-code"
            inputMode="text"
            autoFocus
            aria-describedby={describedBy}
            invalid={invalid}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        )}
      </Field>
      <Button
        type="submit"
        size="lg"
        loading={verify.isPending || verify.isSuccess}
        className="w-full"
      >
        Verify and sign in
      </Button>
      <button
        type="button"
        onClick={onRestart}
        className="text-sm text-primary underline underline-offset-2"
      >
        Use a different account
      </button>
    </form>
  );
}
