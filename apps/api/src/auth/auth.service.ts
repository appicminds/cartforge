import { HttpStatus, Injectable } from "@nestjs/common";
import { ERROR_CODES, isPermission, type CurrentUser } from "@cartforge/types";
import type { LoginInput } from "@cartforge/validation";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordService } from "./password.service";
import { RateLimitService } from "./rate-limit.service";
import { SessionService } from "./session.service";
import { sha256 } from "./tokens";

interface RequestMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput, meta: RequestMeta) {
    const limiterKey = `login:${meta.ip ?? "unknown"}:${sha256(input.email).slice(0, 16)}`;
    await this.rateLimit.hit(limiterKey, 10, 15 * 60);

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const ok = user
      ? user.status === "active" &&
        (await this.passwords.verify(user.password_hash, input.password))
      : (await this.passwords.verifyDummy(input.password), false);

    if (!user || !ok) {
      await this.audit.record({
        action: "auth.login_failed",
        resource_type: "user",
        resource_id: user?.id,
        actor_user_id: null,
        ip: meta.ip,
        request_id: meta.requestId,
      });
      throw new AppException(
        ERROR_CODES.INVALID_CREDENTIALS,
        "Email or password is incorrect.",
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.rateLimit.reset(limiterKey);
    const { token, session } = await this.sessions.create(user.id, meta);
    await this.prisma.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });
    await this.audit.record({
      action: "auth.login",
      resource_type: "session",
      resource_id: session.id,
      actor_user_id: user.id,
      ip: meta.ip,
      request_id: meta.requestId,
    });
    return { token, expiresAt: session.expires_at, user: await this.currentUser(user.id) };
  }

  async logout(sessionId: string, userId: string, meta: RequestMeta): Promise<void> {
    await this.sessions.revoke(sessionId);
    await this.audit.record({
      action: "auth.logout",
      resource_type: "session",
      resource_id: sessionId,
      actor_user_id: userId,
      ip: meta.ip,
      request_id: meta.requestId,
    });
  }

  async currentUser(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: "active", store: { status: "active" } },
          include: { store: true, role: true },
          orderBy: { store: { name: "asc" } },
        },
      },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      stores: user.memberships.map((m) => ({
        store_id: m.store_id,
        store_name: m.store.name,
        role_key: m.role.key,
        role_name: m.role.name,
        permissions: m.role.permissions.filter(isPermission),
      })),
    };
  }
}
