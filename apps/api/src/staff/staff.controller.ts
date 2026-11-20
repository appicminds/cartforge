import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  PERMISSIONS,
  type CreatedInvitation,
  type CurrentUser,
  type DetailResponse,
  type InvitationPreview,
  type TeamView,
} from "@cartforge/types";
import {
  invitationAcceptNewSchema,
  invitationAcceptSchema,
  invitationCreateSchema,
  memberUpdateSchema,
  type InvitationAccept,
  type InvitationAcceptNew,
  type InvitationCreate,
  type MemberUpdate,
} from "@cartforge/validation";
import { AuthService } from "../auth/auth.service";
import { CurrentAuth, CurrentStore, Public, RequirePermissions } from "../auth/decorators";
import { SessionCookies } from "../auth/session-cookies";
import { AppException } from "../common/app-exception";
import { ApiZodBody } from "../common/openapi";
import type { AuthContext, StoreContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StaffService, type StaffActor } from "./staff.service";

const id = (what: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound(what) });

/** A store's team (Settings → Team). */
@ApiTags("staff")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true })
@Controller("staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  private actor(auth: AuthContext, store: StoreContext, req: Request): StaffActor {
    return {
      store_id: store.store_id,
      user_id: auth.user_id,
      permissions: store.permissions,
      request_id: String(req.id),
      ip: req.ip,
    };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.STAFF_READ)
  @ApiOperation({ summary: "Members, open invitations and the roles you can give" })
  async team(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
  ): Promise<DetailResponse<TeamView>> {
    return {
      data: await this.staff.team(this.actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Post("invitations")
  @RequirePermissions(PERMISSIONS.STAFF_WRITE)
  @ApiZodBody(invitationCreateSchema)
  @ApiOperation({
    summary:
      "Invite someone by email (7 days). The link is returned too, for sharing when email is off.",
  })
  async invite(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(invitationCreateSchema)) body: InvitationCreate,
  ): Promise<DetailResponse<CreatedInvitation>> {
    return {
      data: await this.staff.invite(body, this.actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Delete("invitations/:id")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.STAFF_WRITE)
  @ApiOperation({ summary: "Cancel an open invitation" })
  async revoke(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", id("Invitation")) inviteId: string,
  ): Promise<void> {
    await this.staff.revokeInvitation(inviteId, this.actor(auth, store, req));
  }

  @Patch("members/:id")
  @RequirePermissions(PERMISSIONS.STAFF_WRITE)
  @ApiZodBody(memberUpdateSchema)
  @ApiOperation({ summary: "Change a member's role (not the owner, not yourself)" })
  async update(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", id("Team member")) memberId: string,
    @Body(new ZodValidationPipe(memberUpdateSchema)) body: MemberUpdate,
  ): Promise<DetailResponse<TeamView>> {
    const actor = this.actor(auth, store, req);
    await this.staff.updateMember(memberId, body, actor);
    return { data: await this.staff.team(actor), request_id: String(req.id) };
  }

  @Delete("members/:id")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.STAFF_WRITE)
  @ApiOperation({ summary: "Remove someone's access to this store" })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", id("Team member")) memberId: string,
  ): Promise<void> {
    await this.staff.removeMember(memberId, this.actor(auth, store, req));
  }
}

/** Accepting an invitation (no store scope: the token says which store). */
@ApiTags("staff")
@Controller("invitations")
export class InvitationsController {
  constructor(
    private readonly staff: StaffService,
    private readonly auth: AuthService,
    private readonly cookies: SessionCookies,
  ) {}

  @Public()
  @Post("preview")
  @HttpCode(200)
  @ApiZodBody(invitationAcceptSchema)
  @ApiOperation({ summary: "Who invited you, to which store and role" })
  async preview(
    @Req() req: Request,
    @Body(new ZodValidationPipe(invitationAcceptSchema)) body: InvitationAccept,
  ): Promise<DetailResponse<InvitationPreview>> {
    return { data: await this.staff.preview(body.token), request_id: String(req.id) };
  }

  @Post("accept")
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiZodBody(invitationAcceptSchema)
  @ApiOperation({ summary: "Accept as the signed-in user (the invitation's email must match)" })
  async accept(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(invitationAcceptSchema)) body: InvitationAccept,
  ): Promise<DetailResponse<{ store_id: string; user: CurrentUser }>> {
    const { store_id } = await this.staff.accept(body.token, auth.user_id, {
      ip: req.ip,
      requestId: String(req.id),
    });
    return {
      data: { store_id, user: await this.auth.currentUser(auth.user_id) },
      request_id: String(req.id),
    };
  }

  @Public()
  @Post("accept-new")
  @HttpCode(200)
  @ApiZodBody(invitationAcceptNewSchema)
  @ApiOperation({ summary: "Accept by creating an account; signs you in" })
  async acceptNew(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(invitationAcceptNewSchema)) body: InvitationAcceptNew,
  ): Promise<DetailResponse<{ store_id: string; user: CurrentUser }>> {
    const r = await this.staff.acceptNew(body, {
      ip: req.ip,
      userAgent: req.get("user-agent"),
      requestId: String(req.id),
    });
    this.cookies.set(res, r.token, r.session.expires_at);
    return {
      data: { store_id: r.storeId, user: await this.auth.currentUser(r.userId) },
      request_id: String(req.id),
    };
  }
}
