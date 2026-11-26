"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { CurrentUser, DetailResponse, InvitationPreview } from "@cartforge/types";
import { Alert, Button, Field, Input, Spinner } from "@cartforge/ui";
import { newPasswordSchema } from "@cartforge/validation";
import { ApiError, apiRequest } from "@/lib/api-client";
import { applyServerErrors } from "@/lib/forms";
import { meQueryKey } from "@/lib/session";

const STORE_KEY = "cf:active-store";
type Accepted = DetailResponse<{ store_id: string; user: CurrentUser }>;

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  password: newPasswordSchema,
});
type Values = z.infer<typeof schema>;

/**
 * Invitation landing page: shows who invited you to which store, then lets you
 * join — signed in with the invited email, or by creating an account.
 */
export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const preview = useQuery({
    queryKey: ["invitation", token],
    retry: false,
    queryFn: () =>
      apiRequest<DetailResponse<InvitationPreview>>("/invitations/preview", {
        method: "POST",
        body: { token },
      }).then((r) => r.data),
  });
  const me = useQuery({
    queryKey: ["invite-me"],
    retry: false,
    // Always ask again: the person may have just signed in to accept.
    refetchOnMount: "always",
    gcTime: 0,
    queryFn: () =>
      apiRequest<DetailResponse<CurrentUser>>("/auth/me")
        .then((r) => r.data)
        .catch((e) => {
          if (e instanceof ApiError && e.status === 401) return null;
          throw e;
        }),
  });

  const done = (res: Accepted) => {
    try {
      localStorage.setItem(STORE_KEY, res.data.store_id);
    } catch {
      /* storage unavailable */
    }
    qc.setQueryData(meQueryKey, res.data.user);
    router.replace("/admin");
  };
  const accept = useMutation({
    mutationFn: () =>
      apiRequest<Accepted>("/invitations/accept", { method: "POST", body: { token } }),
    onSuccess: done,
  });
  const signOut = useMutation({
    mutationFn: () => apiRequest("/auth/logout", { method: "POST" }),
    onSuccess: () => void me.refetch(),
  });

  if (preview.isPending || me.isPending)
    return <Spinner className="mt-6 size-5" label="Loading invitation" />;
  if (preview.isError)
    return (
      <div className="mt-6 flex flex-col gap-4">
        <Alert tone="danger" title="This invitation can't be used">
          {preview.error.message}
        </Alert>
        <Link href="/login" className="text-sm text-primary underline underline-offset-2">
          Go to sign in
        </Link>
      </div>
    );

  const inv = preview.data;
  const user = me.data;
  const intro = (
    <p className="mt-1 text-sm text-fg-muted">
      {inv.invited_by ?? "Someone"} invited <strong className="text-fg">{inv.email}</strong> to help
      run <strong className="text-fg">{inv.store_name}</strong> as {inv.role_name}.
    </p>
  );

  if (user && user.email === inv.email)
    return (
      <div className="flex flex-col gap-4">
        {intro}
        {accept.isError && <Alert tone="danger" title={accept.error.message} />}
        <Button
          size="lg"
          className="w-full"
          loading={accept.isPending}
          onClick={() => accept.mutate()}
        >
          Join {inv.store_name}
        </Button>
      </div>
    );

  if (user)
    return (
      <div className="flex flex-col gap-4">
        {intro}
        <Alert tone="info" title={`You're signed in as ${user.email}`}>
          Sign out, then sign in as {inv.email} to accept.
        </Alert>
        <Button variant="secondary" loading={signOut.isPending} onClick={() => signOut.mutate()}>
          Sign out
        </Button>
      </div>
    );

  if (inv.account_exists)
    return (
      <div className="flex flex-col gap-4">
        {intro}
        <p className="text-sm">You already have an account. Sign in to accept.</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`}
          className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
        >
          Sign in as {inv.email}
        </Link>
      </div>
    );

  return <NewAccountForm token={token} intro={intro} onDone={done} />;
}

function NewAccountForm({
  token,
  intro,
  onDone,
}: {
  token: string;
  intro: React.ReactNode;
  onDone: (res: Accepted) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", password: "" },
  });
  const join = useMutation({
    mutationFn: (v: Values) =>
      apiRequest<Accepted>("/invitations/accept-new", { method: "POST", body: { token, ...v } }),
    onSuccess: onDone,
    onError: (err) => setFormError(applyServerErrors(err, form.setError, ["name", "password"])),
  });
  const { errors } = form.formState;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((v) => {
        setFormError(null);
        join.mutate(v);
      })}
    >
      {intro}
      <p className="text-sm">Create your account to join.</p>
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
      <Field
        label="Choose a password"
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
      <Button type="submit" size="lg" loading={join.isPending || join.isSuccess} className="w-full">
        Create account and join
      </Button>
    </form>
  );
}
