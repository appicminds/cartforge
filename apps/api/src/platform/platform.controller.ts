import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  PERMISSIONS,
  PLATFORM_ERROR_CODES,
  type CreatedStore,
  type DetailResponse,
  type ListResponse,
  type PlatformConfig,
  type PlatformStoreRow,
  type ResolvedStore,
  type StoreDomainView,
} from "@cartforge/types";
import {
  domainAddSchema,
  platformStoreListSchema,
  platformStoreUpdateSchema,
  storeCreateSchema,
  storeHandleSchema,
  type PlatformStoreListQuery,
  type PlatformStoreUpdate,
  type StoreCreate,
} from "@cartforge/validation";
import { CurrentAuth, CurrentStore, Public, RequirePermissions } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import { ApiZodBody } from "../common/openapi";
import type { AuthContext, StoreContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { API_ENV, type ApiEnv } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { InvalidatesStorefront } from "../storefront/revalidation";
import { DomainsService, type DomainActor } from "./domains.service";
import { PlatformAdminService } from "./platform-admin.service";
import { StoreProvisioningService } from "./provisioning.service";

const domainId = new ParseUUIDPipe({
  exceptionFactory: () =>
    new AppException(
      PLATFORM_ERROR_CODES.DOMAIN_NOT_FOUND,
      "Domain not found.",
      HttpStatus.NOT_FOUND,
    ),
});
const storeId = new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound("Store") });

/** Public platform information and the shared storefront's host lookup. */
@ApiTags("platform")
@Public()
@Controller()
export class PlatformPublicController {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly domains: DomainsService,
  ) {}

  @Get("platform/config")
  @ApiOperation({ summary: "Edition and whether public sign-up is open" })
  config(@Req() req: Request): DetailResponse<PlatformConfig> {
    return {
      data: {
        edition: this.env.CARTFORGE_EDITION,
        signup_enabled: this.env.SIGNUP_ENABLED,
        platform_domain: this.env.PLATFORM_DOMAIN ?? null,
      },
      request_id: String(req.id),
    };
  }

  @Get("storefront/resolve")
  @ApiQuery({ name: "host", required: false })
  @ApiQuery({ name: "handle", required: false, description: "Preview a store that has no domain" })
  @ApiOperation({ summary: "Which store a hostname (or preview handle) serves" })
  async resolve(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query("host") host: unknown,
    @Query("handle") handle: unknown,
  ): Promise<DetailResponse<ResolvedStore>> {
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    const found =
      typeof host === "string"
        ? await this.domains.resolve(host)
        : typeof handle === "string"
          ? await this.domains.resolveHandle(handle)
          : null;
    if (!found) throw AppException.notFound("Store");
    return { data: found, request_id: String(req.id) };
  }

  @Get("platform/domains/tls-check")
  @ApiQuery({ name: "domain", required: true })
  @ApiOperation({
    summary:
      "200 if a certificate may be issued for this host (reverse-proxy on-demand TLS), else 404",
  })
  async tlsCheck(@Query("domain") domain: unknown): Promise<{ ok: true }> {
    if (typeof domain !== "string" || !(await this.domains.tlsAllowed(domain)))
      throw AppException.notFound("Domain");
    return { ok: true };
  }
}

/** A signed-in user's stores (create another, check an address). */
@ApiTags("stores")
@ApiCookieAuth()
@Controller("stores")
export class StoresAccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: StoreProvisioningService,
    private readonly domains: DomainsService,
  ) {}

  @Get("handle-available")
  @Public()
  @ApiQuery({ name: "handle", required: true })
  @ApiOperation({ summary: "Whether a store address (subdomain) is free" })
  async handleAvailable(
    @Req() req: Request,
    @Query("handle") handle: unknown,
  ): Promise<DetailResponse<{ handle: string; available: boolean; reason: string | null }>> {
    const parsed = storeHandleSchema.safeParse(handle);
    if (!parsed.success)
      return {
        data: {
          handle: String(handle ?? ""),
          available: false,
          reason: parsed.error.issues[0]!.message,
        },
        request_id: String(req.id),
      };
    const ok = await this.provisioning.handleAvailable(this.prisma, parsed.data);
    return {
      data: {
        handle: parsed.data,
        available: ok,
        reason: ok ? null : "This address is already taken.",
      },
      request_id: String(req.id),
    };
  }

  @Post()
  @ApiZodBody(storeCreateSchema)
  @ApiOperation({ summary: "Create another store owned by the current user" })
  async create(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(storeCreateSchema)) body: StoreCreate,
  ): Promise<DetailResponse<CreatedStore>> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.user_id } });
    if (!this.provisioning.canCreate(user)) throw this.provisioning.storeCreationDisabled();
    const store = await this.prisma.$transaction((tx) =>
      this.provisioning.create(tx, {
        name: body.store_name,
        handle: body.handle,
        currency: body.currency,
        owner_user_id: auth.user_id,
        contact_email: user.email,
        request_id: String(req.id),
      }),
    );
    const domains = await this.prisma.storeDomain.findMany({ where: { store_id: store.id } });
    return {
      data: {
        store_id: store.id,
        name: store.name,
        handle: store.handle,
        url: this.domains.primaryUrl(domains),
      },
      request_id: String(req.id),
    };
  }
}

/** The current store's domains. */
@ApiTags("settings")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true, description: "Store scope (UUID)" })
@InvalidatesStorefront(false)
@Controller("domains")
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  private actor(auth: AuthContext, store: StoreContext, req: Request): DomainActor {
    return { store_id: store.store_id, user_id: auth.user_id, request_id: String(req.id) };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Platform address and custom domains, with DNS instructions" })
  async list(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
  ): Promise<{ data: StoreDomainView[]; request_id: string }> {
    return { data: await this.domains.list(store.store_id), request_id: String(req.id) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiZodBody(domainAddSchema)
  @ApiOperation({ summary: "Connect a domain you own (then add the DNS records and verify)" })
  async add(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(domainAddSchema)) body: { hostname: string },
  ): Promise<DetailResponse<StoreDomainView>> {
    return {
      data: await this.domains.add(body.hostname, this.actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Post(":id/verify")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiOperation({ summary: "Check the TXT record and activate the domain" })
  async verify(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", domainId) id: string,
  ): Promise<DetailResponse<StoreDomainView>> {
    return {
      data: await this.domains.verify(id, this.actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Post(":id/primary")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiOperation({ summary: "Use this domain for links, sitemaps and emails" })
  async primary(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", domainId) id: string,
  ): Promise<{ data: StoreDomainView[]; request_id: string }> {
    return {
      data: await this.domains.makePrimary(id, this.actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiOperation({ summary: "Disconnect a custom domain" })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", domainId) id: string,
  ): Promise<void> {
    await this.domains.remove(id, this.actor(auth, store, req));
  }
}

/** Platform operators only: every store on the installation. */
@ApiTags("platform")
@ApiCookieAuth()
@Controller("platform/stores")
export class PlatformAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: PlatformAdminService,
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

  @Get()
  @ApiOperation({ summary: "All stores with owner, domain, plan, counts and status" })
  async list(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Query(new ZodValidationPipe(platformStoreListSchema)) q: PlatformStoreListQuery,
  ): Promise<ListResponse<PlatformStoreRow>> {
    await this.assertAdmin(auth);
    return { ...(await this.admin.list(q)), request_id: String(req.id) };
  }

  @Patch(":id")
  @ApiZodBody(platformStoreUpdateSchema)
  @ApiOperation({ summary: "Suspend (with a reason) or reactivate a store" })
  async update(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Param("id", storeId) id: string,
    @Body(new ZodValidationPipe(platformStoreUpdateSchema)) body: PlatformStoreUpdate,
  ): Promise<DetailResponse<{ id: string; status: "active" | "suspended" }>> {
    await this.assertAdmin(auth);
    return {
      data: await this.admin.update(id, body, {
        user_id: auth.user_id,
        request_id: String(req.id),
      }),
      request_id: String(req.id),
    };
  }
}
