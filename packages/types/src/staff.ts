/** Team management and invitations (Next 1). */

export const STAFF_ERROR_CODES = {
  ALREADY_MEMBER: "ALREADY_MEMBER",
  ROLE_NOT_ALLOWED: "ROLE_NOT_ALLOWED",
  OWNER_PROTECTED: "OWNER_PROTECTED",
  INVITATION_INVALID: "INVITATION_INVALID",
  INVITATION_EMAIL_MISMATCH: "INVITATION_EMAIL_MISMATCH",
  ACCOUNT_EXISTS: "ACCOUNT_EXISTS",
} as const;

export interface StaffRole {
  id: string;
  key: string;
  name: string;
  /** Whether the current user may give this role to someone. */
  assignable: boolean;
}

export interface StaffMember {
  membership_id: string;
  user_id: string;
  name: string;
  email: string;
  role: { id: string; key: string; name: string };
  is_owner: boolean;
  is_you: boolean;
  /** Whether the current user may change this person's role or remove them. */
  manageable: boolean;
  joined_at: string;
  last_login_at: string | null;
}

export interface StaffInvitation {
  id: string;
  email: string;
  role: { id: string; key: string; name: string };
  invited_by: string | null;
  expires_at: string;
  created_at: string;
  expired: boolean;
}

export interface TeamView {
  members: StaffMember[];
  invitations: StaffInvitation[];
  roles: StaffRole[];
}

/** Returned to the inviter: the link is shown so it can be shared when email is off. */
export interface CreatedInvitation extends StaffInvitation {
  url: string;
  emailed: boolean;
}

/** Public preview of an invitation, for the accept page. */
export interface InvitationPreview {
  store_name: string;
  email: string;
  role_name: string;
  invited_by: string | null;
  /** True when an account with this email exists (sign in to accept). */
  account_exists: boolean;
}
