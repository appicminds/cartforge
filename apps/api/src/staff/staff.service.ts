import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@cartforge/database";
import {
  STAFF_ERROR_CODES,
  type CreatedInvitation,
  type InvitationPreview,
  type Permission,
  type StaffInvitation,
  type TeamView,
} from "@cartforge/types";
import type { InvitationAcceptNew, InvitationCreate, MemberUpdate } from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../auth/password.service";
import { RateLimitService } from "../auth/rate-limit.service";
import { SessionService } from "../auth/session.service";
import { generateToken, sha256 } from "../auth/tokens";
import { AppException } from "../common/app-exception";
import { API_ENV, type ApiEnv } from "../config/env";
import { Mailer } from "../mail/mailer";
import { PrismaService } from "../prisma/prisma.service";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StaffActor {
  store_id: string;
  user_id: string;
  permissions: ReadonlySet<Permission>;
  request_id?: string;
  ip?: string;
}

interface Meta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

const invalidInvite = () =>
  new AppException(
    STAFF_ERROR_CODES.INVITATION_INVALID,
    "This invitation is invalid, expired or already used. Ask for a new one.",
    HttpStatus.BAD_REQUEST,
  );

/**
 * A store's team: members, roles and invitations. Nobody can hand out more
 * access than they have themselves, and the owner can't be changed or removed
 * here (ownership transfer is a separate, deliberate action).
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly rateLimit: RateLimitService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private get adminUrl(): string {
    return this.env.ADMIN_URL ?? this.env.ADMIN_ORIGIN[0]!;
  }

  /** A role may be given only by someone holding every one of its permissions; never "owner". */
  private canGrant(actor: StaffActor, role: { key: string; permissions: string[] }): boolean {
    return (
      role.key !== "owner" && role.permissions.every((p) => actor.permissions.has(p as Permission))
    );
  }

  async team(actor: StaffActor): Promise<TeamView> {
    const [members, invites, roles] = await Promise.all([
      this.prisma.storeMembership.findMany({
        where: { store_id: actor.store_id, status: "active" },
        include: { user: true, role: true },
        orderBy: { created_at: "asc" },
      }),
      this.prisma.storeInvitation.findMany({
        where: { store_id: actor.store_id, accepted_at: null, revoked_at: null },
        include: { role: true },
        orderBy: { created_at: "desc" },
      }),
      this.prisma.role.findMany({
        where: { store_id: actor.store_id },
        orderBy: { created_at: "asc" },
      }),
    ]);
    const inviters = await this.names(invites.map((i) => i.invited_by));
    return {
      members: members.map((m) => {
        const isOwner = m.role.key === "owner";
        const isYou = m.user_id === actor.user_id;
        return {
          membership_id: m.id,
          user_id: m.user_id,
          name: m.user.name,
          email: m.user.email,
          role: { id: m.role.id, key: m.role.key, name: m.role.name },
          is_owner: isOwner,
          is_you: isYou,
          manageable: !isOwner && !isYou && this.canGrant(actor, m.role),
          joined_at: m.created_at.toISOString(),
          last_login_at: m.user.last_login_at?.toISOString() ?? null,
        };
      }),
      invitations: invites.map((i) => this.inviteView(i, inviters)),
      roles: roles
        .filter((r) => r.key !== "owner")
        .map((r) => ({ id: r.id, key: r.key, name: r.name, assignable: this.canGrant(actor, r) })),
    };
  }

  async invite(input: InvitationCreate, actor: StaffActor): Promise<CreatedInvitation> {
    await this.rateLimit.hit(`invite:${actor.store_id}`, 50, 60 * 60);
    const role = await this.assignableRole(input.role_id, actor);
    const existing = await this.prisma.storeMembership.findFirst({
      where: { store_id: actor.store_id, status: "active", user: { email: input.email } },
    });
    if (existing)
      throw new AppException(
        STAFF_ERROR_CODES.ALREADY_MEMBER,
        "This person is already on the team.",
        HttpStatus.CONFLICT,
        [{ path: "email", message: "Already on the team", code: "already_member" }],
      );

    const token = generateToken(32);
    const invite = await this.prisma.$transaction(async (tx) => {
      // A new invitation replaces any open one for the same email.
      await tx.storeInvitation.updateMany({
        where: {
          store_id: actor.store_id,
          email: input.email,
          accepted_at: null,
          revoked_at: null,
        },
        data: { revoked_at: new Date() },
      });
      const created = await tx.storeInvitation.create({
        data: {
          store_id: actor.store_id,
          email: input.email,
          role_id: role.id,
          token_hash: sha256(token),
          invited_by: actor.user_id,
          expires_at: new Date(Date.now() + INVITE_TTL_MS),
        },
        include: { role: true, store: { select: { name: true } } },
      });
      await this.audit.recordIn(tx, {
        action: "staff.invited",
        resource_type: "invitation",
        resource_id: created.id,
        store_id: actor.store_id,
        actor_user_id: actor.user_id,
        metadata: { email: input.email, role: role.key },
        request_id: actor.request_id,
      });
      return created;
    });
    const url = `${this.adminUrl}/invite?token=${token}`;
    const inviter = (await this.names([actor.user_id])).get(actor.user_id) ?? "Someone";
    const emailed = await this.mailer.send({
      to: input.email,
      subject: `${inviter} invited you to ${invite.store.name} on CartForge`,
      text:
        `${inviter} invited you to help run ${invite.store.name} as ${role.name}.\n\n` +
        `Accept the invitation (valid for 7 days):\n\n${url}\n`,
      html:
        `<p>${esc(inviter)} invited you to help run <strong>${esc(invite.store.name)}</strong> as ${esc(role.name)}.</p>` +
        `<p><a href="${esc(url)}">Accept the invitation</a> (valid for 7 days)</p>`,
    });
    return {
      ...this.inviteView(invite, new Map([[actor.user_id, inviter]])),
      url,
      emailed,
    };
  }

  async revokeInvitation(id: string, actor: StaffActor): Promise<void> {
    const invite = await this.prisma.storeInvitation.findFirst({
      where: { id, store_id: actor.store_id, accepted_at: null, revoked_at: null },
    });
    if (!invite) throw AppException.notFound("Invitation");
    await this.prisma.storeInvitation.update({ where: { id }, data: { revoked_at: new Date() } });
    await this.audit.record({
      action: "staff.invitation_revoked",
      resource_type: "invitation",
      resource_id: id,
      store_id: actor.store_id,
      actor_user_id: actor.user_id,
      metadata: { email: invite.email },
      request_id: actor.request_id,
    });
  }

  async updateMember(membershipId: string, input: MemberUpdate, actor: StaffActor): Promise<void> {
    const member = await this.manageableMember(membershipId, actor);
    const role = await this.assignableRole(input.role_id, actor);
    if (role.id === member.role_id) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.storeMembership.update({ where: { id: member.id }, data: { role_id: role.id } });
      await this.audit.recordIn(tx, {
        action: "staff.role_changed",
        resource_type: "membership",
        resource_id: member.id,
        store_id: actor.store_id,
        actor_user_id: actor.user_id,
        metadata: { user_id: member.user_id, from: member.role.key, to: role.key },
        request_id: actor.request_id,
      });
    });
  }

  async removeMember(membershipId: string, actor: StaffActor): Promise<void> {
    const member = await this.manageableMember(membershipId, actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.storeMembership.delete({ where: { id: member.id } });
      await this.audit.recordIn(tx, {
        action: "staff.removed",
        resource_type: "membership",
        resource_id: member.id,
        store_id: actor.store_id,
        actor_user_id: actor.user_id,
        metadata: { user_id: member.user_id, role: member.role.key },
        request_id: actor.request_id,
      });
    });
  }

  // ───────────── Accepting ─────────────

  async preview(token: string): Promise<InvitationPreview> {
    const invite = await this.openInvite(this.prisma, token);
    const [inviter, account] = await Promise.all([
      this.names([invite.invited_by]),
      this.prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } }),
    ]);
    return {
      store_name: invite.store.name,
      email: invite.email,
      role_name: invite.role.name,
      invited_by: invite.invited_by ? (inviter.get(invite.invited_by) ?? null) : null,
      account_exists: !!account,
    };
  }

  /** Signed-in user accepts; the invitation must be for their email. */
  async accept(token: string, userId: string, meta: Meta): Promise<{ store_id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const invite = await this.openInvite(tx, token, true);
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.email !== invite.email)
        throw new AppException(
          STAFF_ERROR_CODES.INVITATION_EMAIL_MISMATCH,
          `This invitation is for ${invite.email}. Sign in with that email to accept it.`,
          HttpStatus.FORBIDDEN,
        );
      await this.join(tx, invite, user.id, meta);
      return { store_id: invite.store_id };
    });
  }

  /** New person accepts by creating an account; returns a session to sign them in. */
  async acceptNew(input: InvitationAcceptNew, meta: Meta) {
    await this.rateLimit.hit(`invite-accept:${meta.ip ?? "unknown"}`, 20, 60 * 60);
    const hash = await this.passwords.hash(input.password);
    const { userId, storeId } = await this.prisma.$transaction(async (tx) => {
      const invite = await this.openInvite(tx, input.token, true);
      if (await tx.user.findUnique({ where: { email: invite.email } }))
        throw new AppException(
          STAFF_ERROR_CODES.ACCOUNT_EXISTS,
          "An account with this email already exists. Sign in to accept the invitation.",
          HttpStatus.CONFLICT,
        );
      const user = await tx.user.create({
        data: { email: invite.email, name: input.name, password_hash: hash },
      });
      await this.join(tx, invite, user.id, meta);
      return { userId: user.id, storeId: invite.store_id };
    });
    const session = await this.sessions.create(userId, meta);
    await this.prisma.user.update({ where: { id: userId }, data: { last_login_at: new Date() } });
    return { ...session, userId, storeId };
  }

  // ───────────── Helpers ─────────────

  private async join(
    tx: Prisma.TransactionClient,
    invite: { id: string; store_id: string; role_id: string; email: string },
    userId: string,
    meta: Meta,
  ) {
    const existing = await tx.storeMembership.findUnique({
      where: { store_id_user_id: { store_id: invite.store_id, user_id: userId } },
      include: { role: true },
    });
    // Already a member: keep their access (an invitation never downgrades or overrides the owner).
    if (!existing)
      await tx.storeMembership.create({
        data: { store_id: invite.store_id, user_id: userId, role_id: invite.role_id },
      });
    else if (existing.status !== "active")
      await tx.storeMembership.update({
        where: { id: existing.id },
        data: { status: "active", role_id: invite.role_id },
      });
    await tx.storeInvitation.update({
      where: { id: invite.id },
      data: { accepted_at: new Date() },
    });
    await this.audit.recordIn(tx, {
      action: "staff.invitation_accepted",
      resource_type: "invitation",
      resource_id: invite.id,
      store_id: invite.store_id,
      actor_user_id: userId,
      ip: meta.ip,
      request_id: meta.requestId,
    });
  }

  private async openInvite(
    client: Prisma.TransactionClient | PrismaService,
    token: string,
    lock = false,
  ) {
    const hash = sha256(token);
    if (lock)
      await client.$queryRaw`SELECT id FROM store_invitations WHERE token_hash = ${hash} FOR UPDATE`;
    const invite = await client.storeInvitation.findUnique({
      where: { token_hash: hash },
      include: { role: true, store: { select: { name: true, status: true } } },
    });
    if (
      !invite ||
      invite.accepted_at ||
      invite.revoked_at ||
      invite.expires_at <= new Date() ||
      invite.store.status !== "active"
    )
      throw invalidInvite();
    return invite;
  }

  private async assignableRole(roleId: string, actor: StaffActor) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, store_id: actor.store_id },
    });
    if (!role || !this.canGrant(actor, role))
      throw new AppException(
        STAFF_ERROR_CODES.ROLE_NOT_ALLOWED,
        "You can't give this role.",
        HttpStatus.UNPROCESSABLE_ENTITY,
        [{ path: "role_id", message: "You can't give this role", code: "role_not_allowed" }],
      );
    return role;
  }

  private async manageableMember(membershipId: string, actor: StaffActor) {
    const member = await this.prisma.storeMembership.findFirst({
      where: { id: membershipId, store_id: actor.store_id, status: "active" },
      include: { role: true },
    });
    if (!member) throw AppException.notFound("Team member");
    if (member.role.key === "owner")
      throw new AppException(
        STAFF_ERROR_CODES.OWNER_PROTECTED,
        "The store owner can't be changed or removed.",
        HttpStatus.FORBIDDEN,
      );
    if (member.user_id === actor.user_id || !this.canGrant(actor, member.role))
      throw new AppException(
        STAFF_ERROR_CODES.ROLE_NOT_ALLOWED,
        member.user_id === actor.user_id
          ? "You can't change your own access."
          : "You can't change someone with more access than you.",
        HttpStatus.FORBIDDEN,
      );
    return member;
  }

  private async names(ids: (string | null)[]): Promise<Map<string, string>> {
    const list = ids.filter((x): x is string => !!x);
    if (!list.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(list)] } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private inviteView(
    i: {
      id: string;
      email: string;
      role: { id: string; key: string; name: string };
      invited_by: string | null;
      expires_at: Date;
      created_at: Date;
    },
    names: Map<string, string>,
  ): StaffInvitation {
    return {
      id: i.id,
      email: i.email,
      role: { id: i.role.id, key: i.role.key, name: i.role.name },
      invited_by: i.invited_by ? (names.get(i.invited_by) ?? null) : null,
      expires_at: i.expires_at.toISOString(),
      created_at: i.created_at.toISOString(),
      expired: i.expires_at <= new Date(),
    };
  }
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
