import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { PERMISSIONS, type DetailResponse, type DiscountView } from "@cartforge/types";
import { discountListQuerySchema, discountSchema, type DiscountData } from "@cartforge/validation";
import { CurrentAuth, CurrentStore, RequirePermissions } from "../../auth/decorators";
import { AppException } from "../../common/app-exception";
import { ApiZodBody } from "../../common/openapi";
import type { AuthContext, StoreContext } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { DiscountsService } from "./discounts.service";

const discountId = new ParseUUIDPipe({
  exceptionFactory: () => AppException.notFound("Discount"),
});
const actor = (auth: AuthContext, req: Request) => ({
  user_id: auth.user_id,
  request_id: String(req.id),
});

/** Admin: Discounts (Next 8). */
@ApiTags("discounts")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true })
@Controller("discounts")
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "Discounts with status and use count (q: title or code)" })
  async list(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Query(new ZodValidationPipe(discountListQuerySchema))
    q: { q?: string; status?: DiscountView["status"] },
  ): Promise<DetailResponse<DiscountView[]>> {
    return { data: await this.discounts.list(store.store_id, q), request_id: String(req.id) };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.STORE_READ)
  @ApiOperation({ summary: "One discount" })
  async get(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", discountId) id: string,
  ): Promise<DetailResponse<DiscountView>> {
    return { data: await this.discounts.get(store.store_id, id), request_id: String(req.id) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiZodBody(discountSchema)
  @ApiOperation({ summary: "Create a discount code or automatic discount" })
  async create(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Body(new ZodValidationPipe(discountSchema)) body: DiscountData,
  ): Promise<DetailResponse<DiscountView>> {
    return {
      data: await this.discounts.create(store.store_id, body, actor(auth, req)),
      request_id: String(req.id),
    };
  }

  @Put(":id")
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiZodBody(discountSchema)
  @ApiOperation({ summary: "Edit a discount" })
  async update(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", discountId) id: string,
    @Body(new ZodValidationPipe(discountSchema)) body: DiscountData,
  ): Promise<DetailResponse<DiscountView>> {
    return {
      data: await this.discounts.update(store.store_id, id, body, actor(auth, req)),
      request_id: String(req.id),
    };
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.STORE_SETTINGS_WRITE)
  @ApiOperation({ summary: "Delete a discount (orders keep their record of it)" })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", discountId) id: string,
  ): Promise<void> {
    await this.discounts.remove(store.store_id, id, actor(auth, req));
  }
}
