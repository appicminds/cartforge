import { ApiZodBody } from "../common/openapi";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { CookieOptions, Request, Response } from "express";
import {
  COOKIES,
  type CurrentUser,
  type DetailResponse,
  type MfaChallenge,
  type MfaSetup,
  type SessionView,
} from "@cartforge/types";
import {
  loginSchema,
  passwordChangeSchema,
  passwordForgotSchema,
  passwordResetSchema,
  emailVerifySchema,
  mfaCodeOnlySchema,
  mfaDisableSchema,
  mfaEnableSchema,
  mfaLoginSchema,
  signupSchema,
  type LoginInput,
  type PasswordChange,
  type PasswordForgot,
  type PasswordReset,
  type EmailVerify,
  type MfaCodeOnly,
  type MfaDisable,
  type MfaEnable,
  type MfaLogin,
  type Signup,
} from "@cartforge/validation";
import { AccountService } from "./account.service";
import { SessionService } from "./session.service";
import { MfaService } from "./mfa.service";
import { SessionCookies } from "./session-cookies";
import { AuditService } from "../audit/audit.service";
import { AppException } from "../common/app-exception";
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
    private readonly account: AccountService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
    private readonly cookies: SessionCookies,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private cookieBase(): CookieOptions {
    return { secure: this.env.COOKIE_SECURE, sameSite: "lax", path: "/" };
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Sign in with email and password; sets session + CSRF cookies. With two-factor on, returns { mfa_required, mfa_token } instead — finish with POST /auth/login/mfa.",
  })
  @ApiZodBody(loginSchema)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailResponse<CurrentUser | MfaChallenge>> {
    const result = await this.auth.login(body, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      requestId: String(req.id),
    });
    if ("mfa_token" in result)
      return {
        data: { mfa_required: true, mfa_token: result.mfa_token },
        request_id: String(req.id),
      };
    this.cookies.set(res, result.token, result.expiresAt);
    return { data: result.user, request_id: String(req.id) };
  }

  @Public()
  @Post("login/mfa")
  @HttpCode(200)
  @ApiZodBody(mfaLoginSchema)
  @ApiOperation({ summary: "Second sign-in step: authenticator or recovery code" })
  async loginMfa(
    @Body(new ZodValidationPipe(mfaLoginSchema)) body: MfaLogin,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailResponse<CurrentUser>> {
    const result = await this.auth.loginMfa(body.mfa_token, body.code, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      requestId: String(req.id),
    });
    this.cookies.set(res, result.token, result.expiresAt);
    return { data: result.user, request_id: String(req.id) };
  }

  @Public()
  @Post("signup")
  @ApiOperation({ summary: "Create an account and a store (SaaS sign-up); signs you in." })
  @ApiZodBody(signupSchema)
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) body: Signup,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailResponse<CurrentUser>> {
    const result = await this.auth.signup(body, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      requestId: String(req.id),
    });
    this.setSessionCookies(res, result.token, result.expiresAt);
    return { data: result.user, request_id: String(req.id) };
  }

  private setSessionCookies(res: Response, token: string, expires: Date) {
    res.cookie(COOKIES.SESSION, token, { ...this.cookieBase(), httpOnly: true, expires });
    res.cookie(COOKIES.CSRF, deriveCsrfToken(this.env.SESSION_SECRET, token), {
      ...this.cookieBase(),
      httpOnly: false,
      expires,
    });
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

  @Post("password")
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiZodBody(passwordChangeSchema)
  @ApiOperation({
    summary: "Change your password (needs the current one); signs out your other sessions.",
  })
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(passwordChangeSchema)) body: PasswordChange,
  ): Promise<void> {
    await this.account.changePassword(auth.user_id, auth.session_id, body, {
      ip: req.ip,
      requestId: String(req.id),
    });
  }

  @Public()
  @Post("password/forgot")
  @HttpCode(202)
  @ApiZodBody(passwordForgotSchema)
  @ApiOperation({
    summary:
      "Email a one-time reset link (1 hour). Always 202, whether or not the address has an account.",
  })
  async forgotPassword(
    @Req() req: Request,
    @Body(new ZodValidationPipe(passwordForgotSchema)) body: PasswordForgot,
  ): Promise<{ data: { accepted: true }; request_id: string }> {
    await this.account.forgotPassword(body.email, { ip: req.ip, requestId: String(req.id) });
    return { data: { accepted: true }, request_id: String(req.id) };
  }

  @Public()
  @Post("password/reset")
  @HttpCode(204)
  @ApiZodBody(passwordResetSchema)
  @ApiOperation({
    summary: "Set a new password from a reset link; the link is used up and all sessions end.",
  })
  async resetPassword(
    @Req() req: Request,
    @Body(new ZodValidationPipe(passwordResetSchema)) body: PasswordReset,
  ): Promise<void> {
    await this.account.resetPassword(body, { ip: req.ip, requestId: String(req.id) });
  }

  @Public()
  @Post("email/verify")
  @HttpCode(204)
  @ApiZodBody(emailVerifySchema)
  @ApiOperation({ summary: "Confirm your email address from the emailed link" })
  async verifyEmail(
    @Req() req: Request,
    @Body(new ZodValidationPipe(emailVerifySchema)) body: EmailVerify,
  ): Promise<void> {
    await this.account.verifyEmail(body.token, { ip: req.ip, requestId: String(req.id) });
  }

  @Post("email/resend")
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Send the email confirmation link again (3 per hour)" })
  async resendVerification(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<{ data: { emailed: boolean }; request_id: string }> {
    return {
      data: await this.account.resendVerification(auth.user_id),
      request_id: String(req.id),
    };
  }

  @Get("sessions")
  @ApiCookieAuth()
  @ApiOperation({ summary: "Your signed-in browsers and devices" })
  async listSessions(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<{ data: SessionView[]; request_id: string }> {
    return {
      data: await this.sessions.listForUser(auth.user_id, auth.session_id),
      request_id: String(req.id),
    };
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Sign out one of your other devices (use logout for this one)" })
  async revokeSession(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Param("id", new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound("Session") }))
    id: string,
  ): Promise<void> {
    if (id === auth.session_id || !(await this.sessions.revokeOwn(auth.user_id, id)))
      throw AppException.notFound("Session");
    await this.audit.record({
      action: "auth.session_revoked",
      resource_type: "session",
      resource_id: id,
      actor_user_id: auth.user_id,
      ip: req.ip,
      request_id: String(req.id),
    });
  }

  @Post("sessions/sign-out-others")
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Sign out everywhere except this browser" })
  async revokeOthers(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<{ data: { signed_out: number }; request_id: string }> {
    const n = await this.sessions.revokeOthers(auth.user_id, auth.session_id);
    await this.audit.record({
      action: "auth.sessions_revoked",
      resource_type: "user",
      resource_id: auth.user_id,
      actor_user_id: auth.user_id,
      metadata: { count: String(n) },
      ip: req.ip,
      request_id: String(req.id),
    });
    return { data: { signed_out: n }, request_id: String(req.id) };
  }

  @Get("mfa")
  @ApiCookieAuth()
  @ApiOperation({ summary: "Two-factor status and unused recovery codes left" })
  async mfaStatus(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<{ data: { enabled: boolean; recovery_codes_left: number }; request_id: string }> {
    const user = await this.auth.currentUser(auth.user_id);
    return {
      data: {
        enabled: user.mfa_enabled,
        recovery_codes_left: user.mfa_enabled
          ? await this.mfa.remainingRecoveryCodes(auth.user_id)
          : 0,
      },
      request_id: String(req.id),
    };
  }

  @Post("mfa/setup")
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOperation({
    summary: "Start two-factor setup: a new secret to scan with an authenticator app",
  })
  async mfaSetup(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<DetailResponse<MfaSetup>> {
    return { data: await this.mfa.setup(auth.user_id), request_id: String(req.id) };
  }

  @Post("mfa/enable")
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiZodBody(mfaEnableSchema)
  @ApiOperation({ summary: "Confirm setup with a code; returns 10 recovery codes (shown once)" })
  async mfaEnable(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(mfaEnableSchema)) body: MfaEnable,
  ): Promise<{ data: { recovery_codes: string[] }; request_id: string }> {
    return {
      data: await this.mfa.enable(auth.user_id, body.code, {
        ip: req.ip,
        requestId: String(req.id),
      }),
      request_id: String(req.id),
    };
  }

  @Post("mfa/disable")
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiZodBody(mfaDisableSchema)
  @ApiOperation({ summary: "Turn off two-factor sign-in (password and a code required)" })
  async mfaDisable(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(mfaDisableSchema)) body: MfaDisable,
  ): Promise<void> {
    await this.mfa.disable(auth.user_id, body.password, body.code, {
      ip: req.ip,
      requestId: String(req.id),
    });
  }

  @Post("mfa/recovery-codes")
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiZodBody(mfaCodeOnlySchema)
  @ApiOperation({ summary: "Replace your recovery codes (a current code required)" })
  async mfaRecoveryCodes(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(mfaCodeOnlySchema)) body: MfaCodeOnly,
  ): Promise<{ data: { recovery_codes: string[] }; request_id: string }> {
    return {
      data: await this.mfa.regenerateRecoveryCodes(auth.user_id, body.code, {
        ip: req.ip,
        requestId: String(req.id),
      }),
      request_id: String(req.id),
    };
  }
}
