import { Inject, Injectable } from "@nestjs/common";
import { API_ENV, type ApiEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { generateToken, sha256 } from "./tokens";
import { describeDevice } from "./user-agent";
import type { SessionView } from "@cartforge/types";

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface ValidSession {
  session_id: string;
  user_id: string;
  email: string;
  name: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  get ttlMs(): number {
    return this.env.SESSION_TTL_HOURS * 60 * 60 * 1000;
  }

  async create(userId: string, meta: { ip?: string; userAgent?: string }) {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);
    const session = await this.prisma.session.create({
      data: {
        user_id: userId,
        token_hash: sha256(token),
        ip: meta.ip,
        user_agent: meta.userAgent?.slice(0, 512),
        expires_at: expiresAt,
      },
    });
    return { token, session };
  }

  async validate(token: string): Promise<ValidSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { token_hash: sha256(token) },
      include: { user: { select: { id: true, email: true, name: true, status: true } } },
    });
    if (!session || session.revoked_at || session.expires_at <= new Date()) return null;
    if (session.user.status !== "active") return null;

    if (Date.now() - session.last_seen_at.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { last_seen_at: new Date() },
      });
    }
    return {
      session_id: session.id,
      user_id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  /** Your active sessions, newest activity first. */
  async listForUser(userId: string, currentId: string): Promise<SessionView[]> {
    const rows = await this.prisma.session.findMany({
      where: { user_id: userId, revoked_at: null, expires_at: { gt: new Date() } },
      orderBy: { last_seen_at: "desc" },
    });
    return rows.map((s) => ({
      id: s.id,
      device: describeDevice(s.user_agent),
      ip: s.ip,
      created_at: s.created_at.toISOString(),
      last_seen_at: s.last_seen_at.toISOString(),
      current: s.id === currentId,
    }));
  }

  /** Ends one of your own sessions; false when it isn't yours (or is already over). */
  async revokeOwn(userId: string, sessionId: string): Promise<boolean> {
    const r = await this.prisma.session.updateMany({
      where: { id: sessionId, user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return r.count > 0;
  }

  async revokeOthers(userId: string, keepId: string): Promise<number> {
    const r = await this.prisma.session.updateMany({
      where: { user_id: userId, revoked_at: null, NOT: { id: keepId } },
      data: { revoked_at: new Date() },
    });
    return r.count;
  }
}
