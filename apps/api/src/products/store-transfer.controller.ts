import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  PLATFORM_ERROR_CODES,
  type DetailResponse,
  type StoreTransferResult,
} from "@cartforge/types";
import { storeTransferSchema, type StoreTransfer } from "@cartforge/validation";
import { CurrentAuth } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import { ApiZodBody } from "../common/openapi";
import type { AuthContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { StoreTransferService } from "./store-transfer.service";

const storeId = new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound("Store") });

/** Platform operators: move or copy a store's products into another store. */
@ApiTags("platform")
@ApiCookieAuth()
@Controller("platform/stores")
export class StoreTransferController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transfers: StoreTransferService,
  ) {}

  @Post(":id/transfer-products")
  @HttpCode(200)
  @ApiZodBody(storeTransferSchema)
  @ApiOperation({
    summary: "Move or copy this store's draft and active products into another store",
    description:
      "Works in batches: call again until `remaining` is 0. Products already in the target " +
      "(same handle) are not copied twice. `price_rate` is required when currencies differ.",
  })
  async transfer(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Param("id", storeId) id: string,
    @Body(new ZodValidationPipe(storeTransferSchema)) body: StoreTransfer,
  ): Promise<DetailResponse<StoreTransferResult>> {
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
    return {
      data: await this.transfers.transfer(id, body, {
        user_id: auth.user_id,
        request_id: String(req.id),
      }),
      request_id: String(req.id),
    };
  }
}
