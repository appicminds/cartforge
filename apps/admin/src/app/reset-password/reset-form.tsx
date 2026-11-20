"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, Button } from "@cartforge/ui";
import { newPasswordSchema } from "@cartforge/validation";
import { ApiError, apiRequest } from "@/lib/api-client";
import { NewPasswordFields, type NewPasswordValues } from "@/components/new-password-fields";

const schema = z
  .object({ new_password: newPasswordSchema, confirm_password: z.string() })
  .refine((v) => v.new_password === v.confirm_password, {
    message: "The passwords don't match",
    path: ["confirm_password"],
  });

export function ResetForm({ token }: { token: string }) {
  const [formError, setFormError] = useState<{ text: string; expired: boolean } | null>(null);
  const form = useForm<NewPasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { new_password: "", confirm_password: "" },
  });
  const reset = useMutation({
    mutationFn: (v: NewPasswordValues) =>
      apiRequest("/auth/password/reset", {
        method: "POST",
        body: { token, new_password: v.new_password },
      }),
    onError: (err) => {
      if (err instanceof ApiError && err.fields.some((f) => f.path === "new_password"))
        form.setError("new_password", {
          message: err.fields.find((f) => f.path === "new_password")!.message,
        });
      else
        setFormError({
          text: err.message,
          expired: err instanceof ApiError && err.code === "RESET_LINK_INVALID",
        });
    },
  });

  if (reset.isSuccess)
    return (
      <div className="mt-6 flex flex-col gap-4">
        <Alert tone="success" title="Your password has been changed">
          You've been signed out everywhere. Sign in with your new password.
        </Alert>
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
        >
          Sign in
        </Link>
      </div>
    );

  return (
    <form
      noValidate
      className="mt-6 flex flex-col gap-4"
      onSubmit={form.handleSubmit((v) => {
        setFormError(null);
        reset.mutate(v);
      })}
    >
      {formError && (
        <Alert tone="danger" title={formError.text}>
          {formError.expired && (
            <Link href="/forgot-password" className="underline underline-offset-2">
              Get a new link
            </Link>
          )}
        </Alert>
      )}
      <NewPasswordFields register={form.register} errors={form.formState.errors} />
      <Button type="submit" size="lg" loading={reset.isPending} className="mt-2 w-full">
        Save new password
      </Button>
    </form>
  );
}
