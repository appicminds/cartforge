import { Body, Controller, HttpStatus, Param, ParseUUIDPipe, Patch, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  CATALOG_ERROR_CODES,
  PERMISSIONS,
  type DetailResponse,
  type ProductDetail,
} from "@cartforge/types";
import { variantUpdateSchema, type VariantUpdate } from "@cartforge/validation";
import { CurrentAuth, CurrentStore, RequirePermissions } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import type { AuthContext, StoreContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

const variantId = new ParseUUIDPipe({
  exceptionFactory: () =>
    new AppException(
      CATALOG_ERROR_CODES.VARIANT_NOT_FOUND,
      "Variant not found.",
      HttpStatus.NOT_FOUND,
    ),
});

@ApiTags("variants")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true, description: "Store scope (UUID)" })
@Controller("variants")
export class VariantsController {
  constructor(
    private readonly variants: VariantsService,
    private readonly products: ProductsService,
  ) {}

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @ApiOperation({
    summary:
      "Update a variant (SKU, barcode, prices, image, tracking, continue selling, low-stock threshold)",
  })
  async update(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", variantId) id: string,
    @Body(new ZodValidationPipe(variantUpdateSchema)) body: VariantUpdate,
    @Req() req: Request,
  ): Promise<DetailResponse<ProductDetail>> {
    const productId = await this.variants.update(id, body, {
      store_id: store.store_id,
      user_id: auth.user_id,
      request_id: String(req.id),
    });
    return { data: await this.products.get(store.store_id, productId), request_id: String(req.id) };
  }
}
