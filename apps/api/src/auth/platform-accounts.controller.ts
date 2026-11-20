import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { PLATFORM_ERROR_CODES, type DetailResponse } from "@cartforge/types";
import { resetLinkSchema, type ResetLinkInput } from "@cartforge/validation";
import { AppException } from "../common/app-exception";
import { ApiZodBody } from "../common/openapi";
import type { AuthContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { AccountService } from "./account.service";
import { MfaService } from "./mfa.service";
import { CurrentAuth } from "./decorators";

/** Platform operators: help a merchant back into their account. */
@ApiTags("platform")
@ApiCookieAuth()
@Controller("platform/users")
export class PlatformAccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly account: AccountService,
    private readonly mfa: MfaService,
  ) {}

  private async assertAdmin(auth: AuthContext) {
    const u = await this.prisma.user.findUnique({
      where: { id: auth.user_id },
      select: { is_platform_admin: true },
    });
    if (!u?.is_platform_admin)
      throw new AppException(
        PLATFORM_ERROR_CODES.PLATFORM_ADMIN_REQUIRED,
        "Only platform administrators can do this.",
        HttpStatus.FORBIDDEN,
      );
  }

  @Post("reset-link")
  @HttpCode(200)
  @ApiZodBody(resetLinkSchema)
  @ApiOperation({
    summary: "Create a one-time password reset link for an account (shown, not emailed)",
  })
  async resetLink(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(resetLinkSchema)) body: ResetLinkInput,
  ): Promise<DetailResponse<{ email: string; url: string; expires_at: string }>> {
    await this.assertAdmin(auth);
    const link = await this.account.adminResetLink(body.email, auth.user_id, {
      ip: req.ip,
      requestId: String(req.id),
    });
    return { data: link, request_id: String(req.id) };
  }

  @Post("mfa-reset")
  @HttpCode(204)
  @ApiZodBody(resetLinkSchema)
  @ApiOperation({
    summary: "Turn off someone's two-factor sign-in (lost phone and recovery codes); audited",
  })
  async mfaReset(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(resetLinkSchema)) body: ResetLinkInput,
  ): Promise<void> {
    await this.assertAdmin(auth);
    await this.mfa.adminReset(body.email, auth.user_id, { ip: req.ip, requestId: String(req.id) });
  }
}
