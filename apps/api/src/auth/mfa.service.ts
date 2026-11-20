import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES, type MfaSetup } from "@cartforge/types";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { SecretBox } from "../common/secret-box";
import { API_ENV, type ApiEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { PasswordService } from "./password.service";
import { RateLimitService } from "./rate-limit.service";
import { generateToken, sha256 } from "./tokens";
import { newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from "./totp";

/** How long the "password OK, now the code" step stays open. */
export const MFA_CHALLENGE_SECONDS = 5 * 60;

interface Meta {
  ip?: string;
  requestId?: string;
}

const badCode = () =>
  new AppException(
    ERROR_CODES.INVALID_MFA_CODE,
    "That code didn't work. Check your authenticator app, or use a recovery code.",
    HttpStatus.UNPROCESSABLE_ENTITY,
    [{ path: "code", message: "Incorrect code", code: "invalid" }],
  );

const state = (message: string) =>
  new AppException(ERROR_CODES.MFA_STATE, message, HttpStatus.CONFLICT);

const normalizeRecovery = (code: string) => {
  const c = code.toLowerCase().replace(/[\s-]+/g, "");
  return `${c.slice(0, 4)}-${c.slice(4)}`;
};

/**
 * Two-factor sign-in with an authenticator app (TOTP) plus single-use recovery
 * codes. Secrets are encrypted at rest; codes can't be replayed; recovery codes
 * are stored hashed and shown once.
 */
@Injectable()
export class MfaService {
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly rateLimit: RateLimitService,
    private readonly redis: RedisService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.box = new SecretBox(env.APP_ENCRYPTION_KEY);
  }

  // ───────────── Setup ─────────────

  async setup(userId: string): Promise<MfaSetup> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totp_enabled_at) throw state("Two-factor sign-in is already on.");
    const secret = newTotpSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { totp_pending_secret: this.box.seal(secret) },
    });
    return { secret, otpauth_url: otpauthUrl(secret, user.email) };
  }

  async enable(userId: string, code: string, meta: Meta): Promise<{ recovery_codes: string[] }> {
    await this.rateLimit.hit(`mfa-enable:${userId}`, 10, 15 * 60);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totp_enabled_at) throw state("Two-factor sign-in is already on.");
    if (!user.totp_pending_secret) throw state("Start the setup again.");
    const step = verifyTotp(this.box.open(user.totp_pending_secret), code);
    if (step === null) throw badCode();
    const codes = newRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          totp_secret: user.totp_pending_secret,
          totp_pending_secret: null,
          totp_enabled_at: new Date(),
          totp_last_step: step,
        },
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { user_id: userId } });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((c) => ({ user_id: userId, code_hash: sha256(c) })),
      });
      await this.audit.recordIn(tx, {
        action: "auth.mfa_enabled",
        resource_type: "user",
        resource_id: userId,
        actor_user_id: userId,
        ip: meta.ip,
        request_id: meta.requestId,
      });
    });
    return { recovery_codes: codes };
  }

  async disable(userId: string, password: string, code: string, meta: Meta): Promise<void> {
    await this.rateLimit.hit(`mfa-disable:${userId}`, 10, 15 * 60);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totp_enabled_at) throw state("Two-factor sign-in is already off.");
    if (!(await this.passwords.verify(user.password_hash, password)))
      throw new AppException(
        ERROR_CODES.INVALID_CREDENTIALS,
        "Your password is incorrect.",
        HttpStatus.UNPROCESSABLE_ENTITY,
        [{ path: "password", message: "Incorrect password", code: "invalid" }],
      );
    if (!(await this.checkCode(userId, code))) throw badCode();
    await this.clear(userId, userId, "auth.mfa_disabled", meta);
  }

  async regenerateRecoveryCodes(
    userId: string,
    code: string,
    meta: Meta,
  ): Promise<{ recovery_codes: string[] }> {
    await this.rateLimit.hit(`mfa-codes:${userId}`, 10, 15 * 60);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totp_enabled_at) throw state("Turn on two-factor sign-in first.");
    if (!(await this.checkCode(userId, code))) throw badCode();
    const codes = newRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { user_id: userId } });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((c) => ({ user_id: userId, code_hash: sha256(c) })),
      });
      await this.audit.recordIn(tx, {
        action: "auth.mfa_recovery_codes_regenerated",
        resource_type: "user",
        resource_id: userId,
        actor_user_id: userId,
        ip: meta.ip,
        request_id: meta.requestId,
      });
    });
    return { recovery_codes: codes };
  }

  async remainingRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.mfaRecoveryCode.count({ where: { user_id: userId, used_at: null } });
  }

  /** Platform admin: for someone who lost both their phone and their recovery codes. */
  async adminReset(email: string, adminId: string, meta: Meta): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw AppException.notFound("Account");
    if (user.id === adminId) throw state("Turn off your own two-factor sign-in from Your account.");
    if (!user.totp_enabled_at) throw state("Two-factor sign-in is already off for this account.");
    await this.clear(user.id, adminId, "platform.mfa_reset", meta);
  }

  // ───────────── Sign-in challenge ─────────────

  /** Password was right: park the sign-in until the code arrives. */
  async startChallenge(userId: string): Promise<string> {
    const token = generateToken(32);
    await this.redis.set(`mfa:${sha256(token)}`, userId, "EX", MFA_CHALLENGE_SECONDS);
    return token;
  }

  /** Returns the user id when the code is right; the challenge then can't be used again. */
  async completeChallenge(token: string, code: string, meta: Meta): Promise<string> {
    const key = `mfa:${sha256(token)}`;
    const userId = await this.redis.get(key);
    if (!userId)
      throw new AppException(
        ERROR_CODES.UNAUTHENTICATED,
        "This sign-in took too long. Enter your email and password again.",
        HttpStatus.UNAUTHORIZED,
      );
    // Per account, so guessing codes across many challenges doesn't help.
    await this.rateLimit.hit(`mfa-login:${userId}`, 10, 15 * 60);
    if (!(await this.checkCode(userId, code))) {
      await this.audit.record({
        action: "auth.mfa_failed",
        resource_type: "user",
        resource_id: userId,
        actor_user_id: null,
        ip: meta.ip,
        request_id: meta.requestId,
      });
      throw badCode();
    }
    await this.redis.del(key);
    await this.rateLimit.reset(`mfa-login:${userId}`);
    return userId;
  }

  // ───────────── Helpers ─────────────

  /** An authenticator code (not reused) or an unused recovery code, which is then used up. */
  private async checkCode(userId: string, code: string): Promise<boolean> {
    if (/^\d{6}$/.test(code)) {
      return this.prisma.$transaction(async (tx) => {
        const [u] = await tx.$queryRaw<
          { totp_secret: string | null; totp_last_step: bigint | null }[]
        >`
          SELECT totp_secret, totp_last_step FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        if (!u?.totp_secret) return false;
        const step = verifyTotp(this.box.open(u.totp_secret), code, Date.now(), u.totp_last_step);
        if (step === null) return false;
        await tx.user.update({ where: { id: userId }, data: { totp_last_step: step } });
        return true;
      });
    }
    const used = await this.prisma.mfaRecoveryCode.updateMany({
      where: { user_id: userId, used_at: null, code_hash: sha256(normalizeRecovery(code)) },
      data: { used_at: new Date() },
    });
    if (used.count > 0)
      await this.audit.record({
        action: "auth.mfa_recovery_code_used",
        resource_type: "user",
        resource_id: userId,
        actor_user_id: userId,
      });
    return used.count > 0;
  }

  private async clear(userId: string, actorId: string, action: string, meta: Meta) {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          totp_secret: null,
          totp_pending_secret: null,
          totp_enabled_at: null,
          totp_last_step: null,
        },
      });
      await tx.mfaRecoveryCode.deleteMany({ where: { user_id: userId } });
      await this.audit.recordIn(tx, {
        action,
        resource_type: "user",
        resource_id: userId,
        actor_user_id: actorId,
        ip: meta.ip,
        request_id: meta.requestId,
      });
    });
  }
}
