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
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  HEADERS,
  type DetailResponse,
  type OrderConfirmation,
  type OrderListItem,
  type StorefrontCustomer,
} from "@cartforge/types";
import {
  customerAddressSchema,
  customerForgotSchema,
  customerLoginSchema,
  customerProfileSchema,
  customerRegisterSchema,
  customerResetSchema,
  type CustomerAddressInput,
  type CustomerLogin,
  type CustomerProfile,
  type CustomerRegister,
  type CustomerReset,
} from "@cartforge/validation";
import { Public } from "../../auth/decorators";
import { AppException } from "../../common/app-exception";
import { ApiZodBody } from "../../common/openapi";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { StorefrontService } from "../../storefront/storefront.service";
import { OrdersService } from "../orders.service";
import { CustomerAccountsService } from "./customer-accounts.service";

const NO_STORE = "private, no-store";
const uuid = (what: string) =>
  new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound(what) });
const TOKEN = "x-customer-token";

/**
 * Storefront customer accounts (Next 7). The storefront keeps the session token in
 * its own cookie and sends it as X-Customer-Token; the API never sets cookies here.
 */
@ApiTags("storefront")
@ApiHeader({ name: "X-Store-Id", required: true })
@Public()
@Controller("storefront/account")
export class CustomerAccountsController {
  constructor(
    private readonly accounts: CustomerAccountsService,
    private readonly storefront: StorefrontService,
    private readonly orders: OrdersService,
  ) {}

  private async store(req: Request, res: Response) {
    res.setHeader("Cache-Control", NO_STORE);
    return (await this.storefront.assertStore(req.get(HEADERS.STORE_ID))).id;
  }

  private async me(req: Request, res: Response) {
    const storeId = await this.store(req, res);
    return { storeId, customerId: await this.accounts.require(storeId, req.get(TOKEN)) };
  }

  @Post("register")
  @HttpCode(200)
  @ApiZodBody(customerRegisterSchema)
  @ApiOperation({
    summary:
      "Create an account → { token }. An email with past guest orders gets an emailed link instead → { link_sent: true }.",
  })
  async register(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(customerRegisterSchema)) body: CustomerRegister,
  ): Promise<DetailResponse<{ token: string | null; link_sent: boolean }>> {
    const storeId = await this.store(req, res);
    return {
      data: await this.accounts.register(storeId, body, { ip: req.ip }),
      request_id: String(req.id),
    };
  }

  @Post("login")
  @HttpCode(200)
  @ApiZodBody(customerLoginSchema)
  @ApiOperation({ summary: "Sign in → { token } (30 days)" })
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(customerLoginSchema)) body: CustomerLogin,
  ): Promise<DetailResponse<{ token: string }>> {
    const storeId = await this.store(req, res);
    return {
      data: {
        token: await this.accounts.login(storeId, body.email, body.password, { ip: req.ip }),
      },
      request_id: String(req.id),
    };
  }

  @Post("logout")
  @HttpCode(204)
  @ApiHeader({ name: "X-Customer-Token", required: true })
  @ApiOperation({ summary: "Sign out this session" })
  async logout(@Req() req: Request): Promise<void> {
    await this.accounts.logout(req.get(TOKEN));
  }

  @Post("password/forgot")
  @HttpCode(202)
  @ApiZodBody(customerForgotSchema)
  @ApiOperation({ summary: "Email a reset link if the customer exists (always 202)" })
  async forgot(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(customerForgotSchema)) body: { email: string },
  ): Promise<{ data: { accepted: true }; request_id: string }> {
    const storeId = await this.store(req, res);
    await this.accounts.forgot(storeId, body.email, { ip: req.ip });
    return { data: { accepted: true }, request_id: String(req.id) };
  }

  @Post("password/reset")
  @HttpCode(200)
  @ApiZodBody(customerResetSchema)
  @ApiOperation({ summary: "Set a password from the emailed link → { token } (signed in)" })
  async reset(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(customerResetSchema)) body: CustomerReset,
  ): Promise<DetailResponse<{ token: string }>> {
    const storeId = await this.store(req, res);
    return {
      data: { token: await this.accounts.reset(storeId, body.token, body.password) },
      request_id: String(req.id),
    };
  }

  @Get()
  @ApiHeader({ name: "X-Customer-Token", required: true })
  @ApiOperation({ summary: "The signed-in customer with saved addresses" })
  async get(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DetailResponse<StorefrontCustomer>> {
    const { storeId, customerId } = await this.me(req, res);
    return { data: await this.accounts.profile(storeId, customerId), request_id: String(req.id) };
  }

  @Patch()
  @ApiHeader({ name: "X-Customer-Token", required: true })
  @ApiZodBody(customerProfileSchema)
  @ApiOperation({ summary: "Update name, phone, marketing consent" })
  async update(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(customerProfileSchema)) body: CustomerProfile,
  ): Promise<DetailResponse<StorefrontCustomer>> {
    const { storeId, customerId } = await this.me(req, res);
    return {
      data: await this.accounts.updateProfile(storeId, customerId, body),
      request_id: String(req.id),
    };
  }

  @Post("addresses")
  @HttpCode(201)
  @ApiHeader({ name: "X-Customer-Token", required: true })
  @ApiZodBody(customerAddressSchema)
  @ApiOperation({ summary: "Save an address (the first one becomes the default)" })
  async addAddress(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(customerAddressSchema)) body: CustomerAddressInput,
  ): Promise<DetailResponse<StorefrontCustomer>> {
    const { storeId, customerId } = await this.me(req, res);
    return {
      data: await this.accounts.saveAddress(storeId, customerId, body),
      request_id: String(req.id),
    };
  }

  @Patch("addresses/:id")
  @ApiHeader({ name: "X-Customer-Token", required: true })
  @ApiZodBody(customerAddressSchema)
  @ApiOperation({ summary: "Edit a saved address" })
  async editAddress(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id", uuid("Address")) id: string,
    @Body(new ZodValidationPipe(customerAddressSchema)) body: CustomerAddressInput,
  ): Promise<DetailResponse<StorefrontCustomer>> {
    const { storeId, customerId } = await this.me(req, res);
    return {
      data: await this.accounts.saveAddress(storeId, customerId, body, id),
      request_id: String(req.id),
    };
  }

  @Delete("addresses/:id")
  @ApiHeader({ name: "X-Customer-Token", required: true })
  @ApiOperation({ summary: "Delete a saved address" })
  async deleteAddress(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id", uuid("Address")) id: string,
  ): Promise<DetailResponse<StorefrontCustomer>> {
    const { storeId, customerId } = await this.me(req, res);
    return {
      data: await this.accounts.deleteAddress(storeId, customerId, id),
      request_id: String(req.id),
    };
  }

  @Get("orders")
  @ApiHeader({ name: "X-Customer-Token", required: true })
  @ApiOperation({ summary: "The customer's orders, newest first" })
  async orderList(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: OrderListItem[]; request_id: string }> {
    const { storeId, customerId } = await this.me(req, res);
    const r = await this.orders.list(storeId, {
      page: 1,
      page_size: 100,
      q: undefined,
      to_ship: false,
      customer_id: customerId,
    });
    return { data: r.data, request_id: String(req.id) };
  }

  @Get("orders/:id")
  @ApiHeader({ name: "X-Customer-Token", required: true })
  @ApiOperation({ summary: "One of the customer's orders" })
  async order(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param("id", uuid("Order")) id: string,
  ): Promise<DetailResponse<OrderConfirmation>> {
    const { storeId, customerId } = await this.me(req, res);
    return {
      data: await this.orders.forAccount(storeId, id, customerId),
      request_id: String(req.id),
    };
  }
}
