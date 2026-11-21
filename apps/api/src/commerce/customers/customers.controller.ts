import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  PERMISSIONS,
  type CustomerDetail,
  type CustomerListItem,
  type DetailResponse,
  type ListResponse,
} from "@cartforge/types";
import {
  customerListQuerySchema,
  customerUpdateSchema,
  type CustomerListQuery,
  type CustomerUpdate,
} from "@cartforge/validation";
import { CurrentAuth, CurrentStore, RequirePermissions } from "../../auth/decorators";
import { ApiZodBody } from "../../common/openapi";
import type { AuthContext, StoreContext } from "../../common/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CustomersService, customerNotFound } from "./customers.service";

const customerId = new ParseUUIDPipe({ exceptionFactory: customerNotFound });

/** Admin: Customers (Next 7). */
@ApiTags("customers")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true })
@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @ApiOperation({
    summary: "Customers with order count and amount spent",
    description:
      "q matches email, name, phone or an exact tag; sort created_at|last_order_at|total_spent.",
  })
  async list(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Query(new ZodValidationPipe(customerListQuerySchema)) q: CustomerListQuery,
  ): Promise<ListResponse<CustomerListItem>> {
    return { ...(await this.customers.list(store.store_id, q)), request_id: String(req.id) };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.CUSTOMERS_READ)
  @ApiOperation({ summary: "Customer with addresses and orders" })
  async get(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", customerId) id: string,
  ): Promise<DetailResponse<CustomerDetail>> {
    return { data: await this.customers.detail(store.store_id, id), request_id: String(req.id) };
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CUSTOMERS_WRITE)
  @ApiZodBody(customerUpdateSchema)
  @ApiOperation({ summary: "Edit name, phone, staff note, tags, marketing consent" })
  async update(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
    @Param("id", customerId) id: string,
    @Body(new ZodValidationPipe(customerUpdateSchema)) body: CustomerUpdate,
  ): Promise<DetailResponse<CustomerDetail>> {
    return {
      data: await this.customers.update(store.store_id, id, body, {
        user_id: auth.user_id,
        request_id: String(req.id),
      }),
      request_id: String(req.id),
    };
  }
}
