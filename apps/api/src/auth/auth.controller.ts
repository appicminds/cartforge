import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CookieOptions, Request, Response } from "express";
import { COOKIES, type CurrentUser, type DetailResponse } from "@cartforge/types";
import { loginSchema, type LoginInput } from "@cartforge/validation";
import { API_ENV, type ApiEnv } from "../config/env";
import type { AuthContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { CurrentAuth, Public } from "./decorators";
import { deriveCsrfToken } from "./tokens";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private cookieBase(): CookieOptions {
    return { secure: this.env.COOKIE_SECURE, sameSite: "lax", path: "/" };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Sign in with email and password; sets session + CSRF cookies." })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailResponse<CurrentUser>> {
    const result = await this.auth.login(body, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      requestId: String(req.id),
    });
    res.cookie(COOKIES.SESSION, result.token, {
      ...this.cookieBase(),
      httpOnly: true,
      expires: result.expiresAt,
    });
    // Readable by the admin JS so it can echo it in X-CSRF-Token (double submit).
    res.cookie(COOKIES.CSRF, deriveCsrfToken(this.env.SESSION_SECRET, result.token), {
      ...this.cookieBase(),
      httpOnly: false,
      expires: result.expiresAt,
    });
    return { data: result.user, request_id: String(req.id) };
  }

  @Post("logout")
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Revoke the current session." })
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: { ok: true }; request_id: string }> {
    await this.auth.logout(auth.session_id, auth.user_id, {
      ip: req.ip,
      requestId: String(req.id),
    });
    res.clearCookie(COOKIES.SESSION, this.cookieBase());
    res.clearCookie(COOKIES.CSRF, this.cookieBase());
    return { data: { ok: true }, request_id: String(req.id) };
  }

  @Get("me")
  @ApiCookieAuth()
  @ApiOperation({ summary: "Current user with store memberships and permissions." })
  async me(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<DetailResponse<CurrentUser>> {
    return { data: await this.auth.currentUser(auth.user_id), request_id: String(req.id) };
  }
}
