"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  PageHeader,
  useToast,
} from "@cartforge/ui";
import { newPasswordSchema } from "@cartforge/validation";
import { NewPasswordFields } from "@/components/new-password-fields";
import { apiRequest } from "@/lib/api-client";
import { applyServerErrors } from "@/lib/forms";
import { useSession } from "@/lib/session";

const schema = z
  .object({
    current_password: z.string().min(1, "Enter your current password"),
    new_password: newPasswordSchema,
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: "The passwords don't match",
    path: ["confirm_password"],
  })
  .refine((v) => v.new_password !== v.current_password, {
    message: "Choose a password you haven't used here",
    path: ["new_password"],
  });
type Values = z.infer<typeof schema>;

/** Your account: change password (other devices are signed out). */
export default function AccountPage() {
  const { user } = useSession();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });
  const change = useMutation({
    mutationFn: (v: Values) =>
      apiRequest("/auth/password", {
        method: "POST",
        body: { current_password: v.current_password, new_password: v.new_password },
      }),
    onSuccess: () => {
      form.reset();
      toast.success("Password changed. Your other devices were signed out.");
    },
    onError: (err) =>
      setFormError(applyServerErrors(err, form.setError, ["current_password", "new_password"])),
  });
  const { errors } = form.formState;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title="Your account" description={`${user.name} · ${user.email}`} />
      <Card>
        <CardHeader title="Change password" />
        <CardBody>
          <form
            noValidate
            className="flex max-w-sm flex-col gap-4"
            onSubmit={form.handleSubmit((v) => {
              setFormError(null);
              change.mutate(v);
            })}
          >
            {formError && <Alert tone="danger" title={formError} />}
            {/* Lets password managers attach the new password to the right account. */}
            <input type="email" autoComplete="username" value={user.email} readOnly hidden />
            <Field label="Current password" error={errors.current_password?.message} required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  {...form.register("current_password")}
                />
              )}
            </Field>
            <NewPasswordFields register={form.register} errors={errors} />
            <div>
              <Button type="submit" loading={change.isPending}>
                Change password
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
