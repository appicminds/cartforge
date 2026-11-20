"use client";

import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { Field, Input } from "@cartforge/ui";

export interface NewPasswordValues {
  new_password: string;
  confirm_password: string;
}

/** "New password" + "Confirm" pair with the shared rule hint. */
export function NewPasswordFields<T extends NewPasswordValues>({
  register,
  errors,
}: {
  register: UseFormRegister<T>;
  errors: FieldErrors<T>;
}) {
  const reg = register as unknown as UseFormRegister<NewPasswordValues>;
  const errs = errors as FieldErrors<NewPasswordValues>;
  return (
    <>
      <Field
        label="New password"
        error={errs.new_password?.message}
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
            {...reg("new_password")}
          />
        )}
      </Field>
      <Field label="Confirm new password" error={errs.confirm_password?.message} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            aria-describedby={describedBy}
            invalid={invalid}
            {...reg("confirm_password")}
          />
        )}
      </Field>
    </>
  );
}
