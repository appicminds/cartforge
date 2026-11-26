"use client";

import { useEffect, useState } from "react";
import type { CheckoutSettings } from "@cartforge/validation";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Textarea,
  useToast,
} from "@cartforge/ui";
import { ApiError } from "@/lib/api-client";
import { useSaveCheckoutSettings } from "@/lib/commerce";
import { Toggle } from "@/components/toggle";

const KEYS = [
  "bank_transfer_enabled",
  "bank_transfer_instructions",
  "wallet_enabled",
  "wallet_jazzcash",
  "wallet_easypaisa",
  "wallet_raast_id",
  "wallet_iban",
  "wallet_account_title",
  "wallet_note",
  "cod_enabled",
  "cod_instructions",
] as const;
type ManualSettings = Pick<CheckoutSettings, (typeof KEYS)[number]>;
const pick = (s: CheckoutSettings): ManualSettings =>
  Object.fromEntries(KEYS.map((k) => [k, s[k]])) as ManualSettings;

/** Whether any manual method can take payments for this currency. */
export function anyManualMethod(s: CheckoutSettings, currency: string): boolean {
  return s.bank_transfer_enabled || s.cod_enabled || (s.wallet_enabled && currency === "PKR");
}

/**
 * Bank transfer, wallet/Raast transfer and cash on delivery (Settings → Payments).
 * Saved with the rest of the checkout settings, changing only these fields.
 */
export function ManualMethodsCard({
  settings,
  currency,
  canEdit,
}: {
  settings: CheckoutSettings;
  currency: string;
  canEdit: boolean;
}) {
  const [s, setS] = useState<ManualSettings>(pick(settings));
  const save = useSaveCheckoutSettings();
  const toast = useToast();
  useEffect(() => setS(pick(settings)), [settings]);
  const set = <K extends keyof ManualSettings>(k: K, v: ManualSettings[K]) =>
    setS((p) => ({ ...p, [k]: v }));
  const pkr = currency === "PKR";
  const errors: Record<string, string> = {};
  if (save.error instanceof ApiError)
    for (const f of save.error.fields) errors[f.path] ??= f.message;
  const dirty = JSON.stringify(s) !== JSON.stringify(pick(settings));

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          { ...settings, ...s, wallet_enabled: s.wallet_enabled && pkr },
          {
            onSuccess: () => toast.success("Payment methods saved"),
            onError: (err) =>
              toast.error(
                err instanceof ApiError && err.fields.length
                  ? "Check the highlighted fields."
                  : err.message,
              ),
          },
        );
      }}
    >
      <fieldset disabled={!canEdit || save.isPending}>
        <Card>
          <CardHeader
            title="Manual payment methods"
            description="Methods you confirm yourself: you mark the order paid when the money arrives. No gateway fees."
          />
          <CardBody className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <Toggle
                label="Bank transfer"
                description="Customers pay by transfer; you mark the order paid when the money arrives."
                checked={s.bank_transfer_enabled}
                onChange={(v) => set("bank_transfer_enabled", v)}
              />
              {s.bank_transfer_enabled && (
                <Field
                  label="Bank details shown to customers"
                  required
                  error={errors.bank_transfer_instructions}
                  hint="The order number is added automatically as the payment reference."
                >
                  {({ id, describedBy, invalid }) => (
                    <Textarea
                      id={id}
                      aria-describedby={describedBy}
                      aria-invalid={invalid || undefined}
                      rows={3}
                      value={s.bank_transfer_instructions}
                      onChange={(e) => set("bank_transfer_instructions", e.target.value)}
                    />
                  )}
                </Field>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <Toggle
                label="JazzCash, Easypaisa or Raast transfer"
                description={
                  pkr
                    ? "Customers send money to your wallet, Raast ID or bank account; you mark the order paid when it arrives."
                    : `Only for stores that sell in Pakistani rupees (PKR). This store sells in ${currency}.`
                }
                checked={s.wallet_enabled && pkr}
                disabled={!pkr}
                onChange={(v) => set("wallet_enabled", v)}
              />
              {s.wallet_enabled && pkr && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="JazzCash number"
                    error={errors.wallet_jazzcash}
                    hint="e.g. 0300 1234567"
                  >
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        inputMode="tel"
                        aria-describedby={describedBy}
                        invalid={invalid}
                        value={s.wallet_jazzcash}
                        onChange={(e) => set("wallet_jazzcash", e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Easypaisa number" error={errors.wallet_easypaisa}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        inputMode="tel"
                        aria-describedby={describedBy}
                        invalid={invalid}
                        value={s.wallet_easypaisa}
                        onChange={(e) => set("wallet_easypaisa", e.target.value)}
                      />
                    )}
                  </Field>
                  <Field
                    label="Raast ID"
                    error={errors.wallet_raast_id}
                    hint="The mobile number linked to Raast."
                  >
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        inputMode="tel"
                        aria-describedby={describedBy}
                        invalid={invalid}
                        value={s.wallet_raast_id}
                        onChange={(e) => set("wallet_raast_id", e.target.value)}
                      />
                    )}
                  </Field>
                  <Field
                    label="IBAN"
                    error={errors.wallet_iban}
                    hint="PK followed by 22 characters."
                  >
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        invalid={invalid}
                        value={s.wallet_iban}
                        onChange={(e) => set("wallet_iban", e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Account title" required error={errors.wallet_account_title}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        invalid={invalid}
                        value={s.wallet_account_title}
                        onChange={(e) => set("wallet_account_title", e.target.value)}
                      />
                    )}
                  </Field>
                  <Field
                    label="Note for customers"
                    error={errors.wallet_note}
                    hint="Optional, e.g. where to send the receipt."
                  >
                    {({ id, describedBy }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        value={s.wallet_note}
                        onChange={(e) => set("wallet_note", e.target.value)}
                      />
                    )}
                  </Field>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <Toggle
                label="Cash on delivery"
                description="Customers pay the courier when the order arrives."
                checked={s.cod_enabled}
                onChange={(v) => set("cod_enabled", v)}
              />
              {s.cod_enabled && (
                <Field label="Note for customers" error={errors.cod_instructions}>
                  {({ id, describedBy }) => (
                    <Textarea
                      id={id}
                      aria-describedby={describedBy}
                      rows={2}
                      value={s.cod_instructions}
                      onChange={(e) => set("cod_instructions", e.target.value)}
                    />
                  )}
                </Field>
              )}
            </div>
          </CardBody>
        </Card>
      </fieldset>
      {canEdit && dirty && (
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setS(pick(settings));
              save.reset();
            }}
          >
            Discard
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save payment methods
          </Button>
        </div>
      )}
    </form>
  );
}
