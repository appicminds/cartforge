"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Field, Input } from "@cartforge/ui";
import { passwordForgotSchema, type PasswordForgot } from "@cartforge/validation";
import { apiRequest } from "@/lib/api-client";
import { applyServerErrors } from "@/lib/forms";

export function ForgotForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<PasswordForgot>({
    resolver: zodResolver(passwordForgotSchema),
    defaultValues: { email: "" },
  });
  const send = useMutation({
    mutationFn: (body: PasswordForgot) =>
      apiRequest("/auth/password/forgot", { method: "POST", body }),
    onError: (err) => setFormError(applyServerErrors(err, form.setError, ["email"])),
  });

  if (send.isSuccess)
    return (
      <div className="mt-6 flex flex-col gap-4">
        <Alert tone="success" title="Check your email">
          If an account exists for {form.getValues("email")}, a link to choose a new password is on
          its way. It works once and expires in 1 hour.
        </Alert>
        <p className="text-sm text-fg-muted">
          No email after a few minutes? Check spam, or ask the platform team for a reset link.
        </p>
        <Link href="/login" className="text-sm text-primary underline underline-offset-2">
          Back to sign in
        </Link>
      </div>
    );

  const { errors } = form.formState;
  return (
    <form
      noValidate
      className="mt-6 flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => {
        setFormError(null);
        send.mutate(values);
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
      <Button type="submit" size="lg" loading={send.isPending} className="mt-2 w-full">
        Send reset link
      </Button>
      <Link href="/login" className="text-center text-sm text-primary underline underline-offset-2">
        Back to sign in
      </Link>
    </form>
  );
}
