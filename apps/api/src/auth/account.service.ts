import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES, PLATFORM_ERROR_CODES } from "@cartforge/types";
import type { PasswordChange, PasswordReset } from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { API_ENV, type ApiEnv } from "../config/env";
import { Mailer } from "../mail/mailer";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordService } from "./password.service";
import { RateLimitService } from "./rate-limit.service";
import { generateToken, sha256 } from "./tokens";

/** Reset links work once, for one hour. */
export const RESET_TTL_MS = 60 * 60 * 1000;

interface Meta {
  ip?: string;
  requestId?: string;
}

const invalidLink = () =>
  new AppException(
    ERROR_CODES.RESET_LINK_INVALID,
    "This reset link is invalid or has expired. Ask for a new one.",
    HttpStatus.BAD_REQUEST,
  );

/** Change password, forgot password (emailed link) and reset (PRD §23 account security). */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private get adminUrl(): string {
    return this.env.ADMIN_URL ?? this.env.ADMIN_ORIGIN[0]!;
  }

  /** Signed-in user: needs the current password; signs out every other session. */
  async changePassword(
    userId: string,
    sessionId: string,
    input: PasswordChange,
    meta: Meta,
  ): Promise<void> {
    await this.rateLimit.hit(`password-change:${userId}`, 10, 15 * 60);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.password_hash, input.current_password)))
      throw new AppException(
        ERROR_CODES.INVALID_CREDENTIALS,
        "Your current password is incorrect.",
        HttpStatus.UNPROCESSABLE_ENTITY,
        [{ path: "current_password", message: "Incorrect password", code: "invalid" }],
      );
    const hash = await this.passwords.hash(input.new_password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { password_hash: hash } });
      await tx.session.updateMany({
        where: { user_id: userId, revoked_at: null, NOT: { id: sessionId } },
        data: { revoked_at: new Date() },
      });
      await tx.passwordResetToken.updateMany({
        where: { user_id: userId, used_at: null },
        data: { used_at: new Date() },
      });
      await this.audit.recordIn(tx, {
        action: "auth.password_changed",
        resource_type: "user",
        resource_id: userId,
        actor_user_id: userId,
        ip: meta.ip,
        request_id: meta.requestId,
      });
    });
  }

  /**
   * Emails a reset link when the address belongs to an active account. Always
   * answers the same way (and takes similar time) so it can't be used to find accounts.
   */
  async forgotPassword(email: string, meta: Meta): Promise<void> {
    await this.rateLimit.hit(`password-forgot-ip:${meta.ip ?? "unknown"}`, 20, 60 * 60);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== "active") return;
    // At most 3 emails per account per hour; extra requests are silently dropped.
    const recent = await this.prisma.passwordResetToken.count({
      where: {
        user_id: user.id,
        created_by: null,
        created_at: { gt: new Date(Date.now() - RESET_TTL_MS) },
      },
    });
    if (recent >= 3) return;
    const { url } = await this.createLink(user.id, null);
    await this.audit.record({
      action: "auth.password_reset_requested",
      resource_type: "user",
      resource_id: user.id,
      actor_user_id: null,
      ip: meta.ip,
      request_id: meta.requestId,
    });
    await this.mailer.send({
      to: user.email,
      subject: "Reset your CartForge password",
      text:
        `Hi ${user.name},\n\nUse this link to choose a new password. It works once and expires in 1 hour:\n\n${url}\n\n` +
        "If you didn't ask for this, ignore this email — your password stays the same.",
      html:
        `<p>Hi ${escapeHtml(user.name)},</p><p>Use this link to choose a new password. It works once and expires in 1 hour:</p>` +
        `<p><a href="${escapeHtml(url)}">Choose a new password</a></p>` +
        "<p>If you didn't ask for this, ignore this email — your password stays the same.</p>",
    });
  }

  /** Sets the new password from a valid link; the link is used up and every session ends. */
  async resetPassword(input: PasswordReset, meta: Meta): Promise<void> {
    await this.rateLimit.hit(`password-reset:${meta.ip ?? "unknown"}`, 20, 15 * 60);
    const hash = await this.passwords.hash(input.new_password);
    await this.prisma.$transaction(async (tx) => {
      const [link] = await tx.$queryRaw<
        { id: string; user_id: string; expires_at: Date; used_at: Date | null }[]
      >`SELECT id, user_id, expires_at, used_at FROM password_reset_tokens
        WHERE token_hash = ${sha256(input.token)} FOR UPDATE`;
      if (!link || link.used_at || link.expires_at <= new Date()) throw invalidLink();
      const user = await tx.user.findUnique({ where: { id: link.user_id } });
      if (!user || user.status !== "active") throw invalidLink();
      await tx.user.update({ where: { id: user.id }, data: { password_hash: hash } });
      await tx.passwordResetToken.updateMany({
        where: { user_id: user.id, used_at: null },
        data: { used_at: new Date() },
      });
      await tx.session.updateMany({
        where: { user_id: user.id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      await this.audit.recordIn(tx, {
        action: "auth.password_reset",
        resource_type: "user",
        resource_id: user.id,
        actor_user_id: user.id,
        ip: meta.ip,
        request_id: meta.requestId,
      });
    });
  }

  /**
   * Platform admin: a reset link for an account, to hand over through a channel the
   * operator trusts (no email needed). Not for other platform admins.
   */
  async adminResetLink(
    email: string,
    adminId: string,
    meta: Meta,
  ): Promise<{ email: string; url: string; expires_at: string; emailed: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== "active") throw AppException.notFound("Account");
    if (user.is_platform_admin)
      throw new AppException(
        PLATFORM_ERROR_CODES.PLATFORM_ADMIN_REQUIRED,
        "Platform administrators reset their own password with “Forgot password”.",
        HttpStatus.FORBIDDEN,
      );
    const { url, expires } = await this.createLink(user.id, adminId);
    await this.audit.record({
      action: "platform.password_reset_link_created",
      resource_type: "user",
      resource_id: user.id,
      actor_user_id: adminId,
      ip: meta.ip,
      request_id: meta.requestId,
    });
    return { email: user.email, url, expires_at: expires.toISOString(), emailed: false };
  }

  private async createLink(userId: string, createdBy: string | null) {
    const token = generateToken(32);
    const expires = new Date(Date.now() + RESET_TTL_MS);
    await this.prisma.passwordResetToken.create({
      data: {
        user_id: userId,
        token_hash: sha256(token),
        expires_at: expires,
        created_by: createdBy,
      },
    });
    return { url: `${this.adminUrl}/reset-password?token=${token}`, expires };
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
