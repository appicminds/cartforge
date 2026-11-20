"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { CurrentUser, DetailResponse } from "@cartforge/types";
import { Alert, Button, Field, Input } from "@cartforge/ui";
import { loginSchema, type LoginInput } from "@cartforge/validation";
import { apiRequest } from "@/lib/api-client";
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

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors } = form.formState;

  const login = useMutation({
    mutationFn: (input: LoginInput) =>
      apiRequest<DetailResponse<CurrentUser>>("/auth/login", { method: "POST", body: input }),
    onSuccess: (res) => {
      qc.setQueryData(meQueryKey, res.data);
      router.replace(safeNext(params.get("next")));
    },
    onError: (err) => setFormError(applyServerErrors(err, form.setError, ["email", "password"])),
  });

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
