import { InvalidatesStorefront } from "../storefront/revalidation";
import { Body, Controller, Get, HttpCode, Post, Query, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiZodBody } from "../common/openapi";
import type { Request } from "express";
import {
  PERMISSIONS,
  type DetailResponse,
  type InventoryRow,
  type ListResponse,
  type StockMovementSummary,
} from "@cartforge/types";
import {
  inventoryAdjustSchema,
  inventoryListQuerySchema,
  movementListQuerySchema,
  type InventoryAdjust,
  type InventoryListQuery,
  type MovementListQuery,
} from "@cartforge/validation";
import { CurrentAuth, CurrentStore, RequirePermissions } from "../auth/decorators";
import type { AuthContext, StoreContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { InventoryService } from "./inventory.service";

@ApiTags("inventory")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true, description: "Store scope (UUID)" })
@InvalidatesStorefront()
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({
    summary:
      "Stock by variant (default location). Filters: q, stock=all|low|out; sort=product|available|updated_at",
  })
  async list(
    @CurrentStore() store: StoreContext,
    @Query(new ZodValidationPipe(inventoryListQuerySchema)) q: InventoryListQuery,
    @Req() req: Request,
  ): Promise<ListResponse<InventoryRow>> {
    return { ...(await this.inventory.list(store.store_id, q)), request_id: String(req.id) };
  }

  @Post("adjustments")
  @HttpCode(201)
  @RequirePermissions(PERMISSIONS.INVENTORY_ADJUST)
  @ApiOperation({
    summary: "Adjust stock (mode delta|set) with a mandatory reason; records an immutable movement",
  })
  @ApiZodBody(inventoryAdjustSchema)
  async adjust(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Body(new ZodValidationPipe(inventoryAdjustSchema)) body: InventoryAdjust,
    @Req() req: Request,
  ): Promise<DetailResponse<InventoryRow>> {
    const data = await this.inventory.adjust(body, {
      store_id: store.store_id,
      user_id: auth.user_id,
      request_id: String(req.id),
    });
    return { data, request_id: String(req.id) };
  }

  @Get("movements")
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  @ApiOperation({ summary: "Movement history for a variant (newest first)" })
  async movements(
    @CurrentStore() store: StoreContext,
    @Query(new ZodValidationPipe(movementListQuerySchema)) q: MovementListQuery,
    @Req() req: Request,
  ): Promise<ListResponse<StockMovementSummary>> {
    return { ...(await this.inventory.movements(store.store_id, q)), request_id: String(req.id) };
  }
}
