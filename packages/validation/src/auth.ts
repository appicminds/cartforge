import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password: z.string().min(1, "Password is required").max(1024),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Rules for any new password (sign-up, change, reset). */
export const newPasswordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(200, "Use 200 characters or fewer")
  .refine((p) => /[a-zA-Z]/.test(p) && /[^a-zA-Z]/.test(p), "Mix letters with numbers or symbols");

export const passwordChangeSchema = z
  .object({
    current_password: z.string().min(1, "Enter your current password").max(1024),
    new_password: newPasswordSchema,
  })
  .strict()
  .refine((v) => v.current_password !== v.new_password, {
    message: "Choose a password you haven't used here",
    path: ["new_password"],
  });
export type PasswordChange = z.infer<typeof passwordChangeSchema>;

export const passwordForgotSchema = z
  .object({ email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254) })
  .strict();
export type PasswordForgot = z.infer<typeof passwordForgotSchema>;

export const passwordResetSchema = z
  .object({
    token: z.string().min(20).max(200),
    new_password: newPasswordSchema,
  })
  .strict();
export type PasswordReset = z.infer<typeof passwordResetSchema>;

/** Platform admin: a one-time reset link for an account (handed over by the operator). */
export const resetLinkSchema = z
  .object({ email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254) })
  .strict();
export type ResetLinkInput = z.infer<typeof resetLinkSchema>;

export const emailVerifySchema = z.object({ token: z.string().min(20).max(200) }).strict();
export type EmailVerify = z.infer<typeof emailVerifySchema>;

/** A 6-digit authenticator code or a recovery code ("abcd-efgh"). */
export const mfaCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/\s+/g, ""))
  .pipe(
    z
      .string()
      .regex(/^(\d{6}|[a-z2-9]{4}-?[a-z2-9]{4})$/, "Enter the 6-digit code or a recovery code"),
  );

export const mfaLoginSchema = z
  .object({ mfa_token: z.string().min(20).max(200), code: mfaCodeSchema })
  .strict();
export type MfaLogin = z.infer<typeof mfaLoginSchema>;

export const mfaEnableSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code from your app"),
  })
  .strict();
export type MfaEnable = z.infer<typeof mfaEnableSchema>;

export const mfaDisableSchema = z
  .object({ password: z.string().min(1, "Enter your password").max(1024), code: mfaCodeSchema })
  .strict();
export type MfaDisable = z.infer<typeof mfaDisableSchema>;

export const mfaCodeOnlySchema = z.object({ code: mfaCodeSchema }).strict();
export type MfaCodeOnly = z.infer<typeof mfaCodeOnlySchema>;
