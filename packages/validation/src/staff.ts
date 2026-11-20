import { z } from "zod";
import { newPasswordSchema } from "./auth.js";
import { uuidSchema } from "./common.js";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const invitationCreateSchema = z.object({ email, role_id: uuidSchema }).strict();
export type InvitationCreate = z.infer<typeof invitationCreateSchema>;

export const memberUpdateSchema = z.object({ role_id: uuidSchema }).strict();
export type MemberUpdate = z.infer<typeof memberUpdateSchema>;

const token = z.string().min(20).max(200);

export const invitationAcceptSchema = z.object({ token }).strict();
export type InvitationAccept = z.infer<typeof invitationAcceptSchema>;

/** Accept by creating an account (the email comes from the invitation). */
export const invitationAcceptNewSchema = z
  .object({
    token,
    name: z.string().trim().min(1, "Enter your name").max(120),
    password: newPasswordSchema,
  })
  .strict();
export type InvitationAcceptNew = z.infer<typeof invitationAcceptNewSchema>;
