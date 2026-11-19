import { Controller, Get, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { PERMISSIONS, type DetailResponse, type StoreSummary } from "@cartforge/types";
import { RequirePermissions, CurrentStore } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import type { StoreContext } from "../common/request-context";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("store")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true, description: "Store scope (UUID)" })
@Controller("store")
export class StoresController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Settings of the store in the current scope." })
  async current(
    @CurrentStore() scope: StoreContext,
    @Req() req: Request,
  ): Promise<DetailResponse<StoreSummary>> {
    const store = await this.prisma.store.findUnique({ where: { id: scope.store_id } });
    if (!store) throw AppException.notFound("Store");
    return {
      data: {
        id: store.id,
        name: store.name,
        currency: store.currency,
        locale: store.locale,
        timezone: store.timezone,
        contact_email: store.contact_email,
      },
      request_id: String(req.id),
    };
  }
}
