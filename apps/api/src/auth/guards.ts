import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { COOKIES, ERROR_CODES, HEADERS, isPermission, type Permission } from "@cartforge/types";
import { uuidSchema } from "@cartforge/validation";
import { AppException } from "../common/app-exception";
import { API_ENV, type ApiEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC, REQUIRED_PERMISSIONS, STORE_SCOPED } from "./decorators";
import { SessionService } from "./session.service";
import { deriveCsrfToken, safeEqual } from "./tokens";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function meta<T>(reflector: Reflector, key: string, ctx: ExecutionContext): T | undefined {
  return reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);
}

/** 1. Resolves the session cookie into req.auth. Everything is private unless @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token: unknown = req.cookies?.[COOKIES.SESSION];
    if (typeof token === "string" && token.length > 0 && token.length < 200) {
      const session = await this.sessions.validate(token);
      if (session) {
        req.auth = {
          user_id: session.user_id,
          session_id: session.session_id,
          email: session.email,
          name: session.name,
        };
        req.sessionToken = token;
      }
    }
    if (meta<boolean>(this.reflector, IS_PUBLIC, ctx)) return true;
    if (!req.auth) throw AppException.unauthenticated();
    return true;
  }
}

/**
 * 2. CSRF protection for cookie-authenticated state changes (PRD §23):
 *    - Origin, when present, must be the admin origin.
 *    - Authenticated unsafe requests must echo the session-bound CSRF token.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!UNSAFE_METHODS.has(req.method)) return true;

    const origin = req.get("origin");
    if (origin && origin !== this.env.ADMIN_ORIGIN) throw this.reject();

    if (req.sessionToken) {
      const header = req.get(HEADERS.CSRF);
      const expected = deriveCsrfToken(this.env.SESSION_SECRET, req.sessionToken);
      if (!header || !safeEqual(header, expected)) throw this.reject();
    }
    return true;
  }

  private reject() {
    return new AppException(
      ERROR_CODES.CSRF_INVALID,
      "Invalid or missing CSRF token.",
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * 3. Store scope (BE-003, BE-012): resolves X-Store-Id against the user's active
 *    membership and loads the role's permissions into req.store.
 */
@Injectable()
export class StoreScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const needsScope =
      meta<boolean>(this.reflector, STORE_SCOPED, ctx) ||
      (meta<Permission[]>(this.reflector, REQUIRED_PERMISSIONS, ctx)?.length ?? 0) > 0;
    if (!needsScope) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.auth) throw AppException.unauthenticated();

    const storeId = req.get(HEADERS.STORE_ID);
    if (!storeId || !uuidSchema.safeParse(storeId).success) {
      throw new AppException(
        ERROR_CODES.STORE_SCOPE_REQUIRED,
        "A valid X-Store-Id header is required.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const membership = await this.prisma.storeMembership.findUnique({
      where: { store_id_user_id: { store_id: storeId, user_id: req.auth.user_id } },
      include: { role: true, store: { select: { status: true } } },
    });
    // Same response whether the store doesn't exist or the user isn't a member,
    // so store IDs can't be probed.
    if (!membership || membership.status !== "active" || membership.store.status !== "active") {
      throw new AppException(
        ERROR_CODES.STORE_ACCESS_DENIED,
        "You don't have access to this store.",
        HttpStatus.FORBIDDEN,
      );
    }

    req.store = {
      store_id: storeId,
      role_key: membership.role.key,
      permissions: new Set(membership.role.permissions.filter(isPermission)),
    };
    return true;
  }
}

/** 4. Permission check against the resolved store role (RBAC, PRD §3). */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = meta<Permission[]>(this.reflector, REQUIRED_PERMISSIONS, ctx);
    if (!required?.length) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const granted = req.store?.permissions;
    if (!granted || !required.every((p) => granted.has(p))) throw AppException.forbidden();
    return true;
  }
}
