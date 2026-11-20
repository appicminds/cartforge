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
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  PERMISSIONS,
  type BulkResult,
  type DetailResponse,
  type ListResponse,
  type ProductDetail,
  type ProductListItem,
  type VariantPlan,
} from "@cartforge/types";
import {
  productCreateSchema,
  productListQuerySchema,
  productBulkSchema,
  productDuplicateSchema,
  productOptionsApplySchema,
  productOptionsPreviewSchema,
  productUpdateSchema,
  variantBulkUpdateSchema,
  type ProductBulk,
  type ProductCreate,
  type ProductDuplicate,
  type ProductListQuery,
  type ProductOptionsApply,
  type ProductUpdate,
  type VariantBulkUpdate,
} from "@cartforge/validation";
import { CurrentAuth, CurrentStore, RequirePermissions } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import type { AuthContext, StoreContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProductsService, type ActorContext } from "./products.service";
import { VariantsService } from "./variants.service";

/** Non-UUID ids are simply "not found" — never a 500 or a validation leak. */
const productId = new ParseUUIDPipe({ exceptionFactory: () => AppException.notFound("Product") });

@ApiTags("products")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true, description: "Store scope (UUID)" })
@Controller("products")
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly variants: VariantsService,
  ) {}

  private ctx(auth: AuthContext, store: StoreContext, req: Request): ActorContext {
    return {
      store_id: store.store_id,
      user_id: auth.user_id,
      can_publish: store.permissions.has(PERMISSIONS.PRODUCTS_PUBLISH),
      can_adjust_inventory: store.permissions.has(PERMISSIONS.INVENTORY_ADJUST),
      request_id: String(req.id),
      ip: req.ip,
    };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({
    summary: "List products",
    description:
      "Query: page, page_size (≤100), q (title/handle/vendor/SKU/barcode), status (csv), product_type (csv), " +
      "sort (title|created_at|updated_at|status), order (asc|desc).",
  })
  async list(
    @CurrentStore() store: StoreContext,
    @Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQuery,
    @Req() req: Request,
  ): Promise<ListResponse<ProductListItem>> {
    return { ...(await this.products.list(store.store_id, query)), request_id: String(req.id) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @ApiOperation({
    summary: "Create a product (defaults to Draft; handle generated from title when omitted)",
  })
  async create(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Body(new ZodValidationPipe(productCreateSchema)) body: ProductCreate,
    @Req() req: Request,
  ): Promise<DetailResponse<ProductDetail>> {
    return {
      data: await this.products.create(body, this.ctx(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({ summary: "Get product detail" })
  async get(
    @CurrentStore() store: StoreContext,
    @Param("id", productId) id: string,
    @Req() req: Request,
  ): Promise<DetailResponse<ProductDetail>> {
    return { data: await this.products.get(store.store_id, id), request_id: String(req.id) };
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @ApiOperation({
    summary: "Update product fields",
    description:
      "Status changes also require products.publish. Changing a published product's handle requires confirm_handle_change.",
  })
  async update(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", productId) id: string,
    @Body(new ZodValidationPipe(productUpdateSchema)) body: ProductUpdate,
    @Req() req: Request,
  ): Promise<DetailResponse<ProductDetail>> {
    return {
      data: await this.products.update(id, body, this.ctx(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Delete(":id")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PRODUCTS_DELETE)
  @ApiOperation({ summary: "Soft-delete a product" })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", productId) id: string,
    @Req() req: Request,
  ): Promise<{ data: { id: string; deleted: true }; request_id: string }> {
    await this.products.remove(id, this.ctx(auth, store, req));
    return { data: { id, deleted: true }, request_id: String(req.id) };
  }

  @Post(":id/options/preview")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({
    summary: "Preview which variants options would keep, create and remove (no changes made)",
  })
  async previewOptions(
    @CurrentStore() store: StoreContext,
    @Param("id", productId) id: string,
    @Body(new ZodValidationPipe(productOptionsPreviewSchema))
    body: { options: ProductOptionsApply["options"] },
    @Req() req: Request,
  ): Promise<DetailResponse<VariantPlan>> {
    return {
      data: await this.variants.preview(store.store_id, id, body.options),
      request_id: String(req.id),
    };
  }

  @Put(":id/options")
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @ApiOperation({
    summary: "Set options and reconcile variants",
    description:
      "Existing variants keep their data. Removals require confirm_removals=true (409 otherwise).",
  })
  async applyOptions(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", productId) id: string,
    @Body(new ZodValidationPipe(productOptionsApplySchema)) body: ProductOptionsApply,
    @Req() req: Request,
  ): Promise<DetailResponse<ProductDetail> & { plan: VariantPlan }> {
    const plan = await this.variants.apply(id, body, {
      store_id: store.store_id,
      user_id: auth.user_id,
      request_id: String(req.id),
    });
    return { data: await this.products.get(store.store_id, id), plan, request_id: String(req.id) };
  }

  @Patch(":id/variants")
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @ApiOperation({ summary: "Bulk-edit selected variants (prices, tracking, continue selling)" })
  async bulkVariants(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", productId) id: string,
    @Body(new ZodValidationPipe(variantBulkUpdateSchema)) body: VariantBulkUpdate,
    @Req() req: Request,
  ): Promise<DetailResponse<ProductDetail>> {
    await this.variants.bulkUpdate(id, body, {
      store_id: store.store_id,
      user_id: auth.user_id,
      request_id: String(req.id),
    });
    return { data: await this.products.get(store.store_id, id), request_id: String(req.id) };
  }

  @Post("bulk")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @ApiOperation({
    summary: "Bulk action on up to 100 products",
    description:
      "publish|draft|archive need products.publish; delete needs products.delete. Returns per-product success/failure.",
  })
  async bulk(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Body(new ZodValidationPipe(productBulkSchema)) body: ProductBulk,
    @Req() req: Request,
  ): Promise<DetailResponse<BulkResult>> {
    const needs =
      body.action === "delete"
        ? PERMISSIONS.PRODUCTS_DELETE
        : ["publish", "draft", "archive"].includes(body.action)
          ? PERMISSIONS.PRODUCTS_PUBLISH
          : null;
    if (needs && !store.permissions.has(needs)) throw AppException.forbidden();
    return {
      data: await this.products.bulk(body, this.ctx(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Post(":id/duplicate")
  @RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
  @ApiOperation({
    summary: "Duplicate a product as a new Draft (no SKUs, zero stock, images by reference)",
  })
  async duplicate(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", productId) id: string,
    @Body(new ZodValidationPipe(productDuplicateSchema)) body: ProductDuplicate,
    @Req() req: Request,
  ): Promise<DetailResponse<ProductDetail>> {
    return {
      data: await this.products.duplicate(id, body, this.ctx(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Post(":id/publish")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PRODUCTS_PUBLISH)
  @ApiOperation({ summary: "Validate and publish (422 PRODUCT_NOT_PUBLISHABLE lists what to fix)" })
  async publish(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", productId) id: string,
    @Req() req: Request,
  ): Promise<DetailResponse<ProductDetail>> {
    return {
      data: await this.products.update(
        id,
        this.products.statusChange("publish"),
        this.ctx(auth, store, req),
      ),
      request_id: String(req.id),
    };
  }

  @Post(":id/archive")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.PRODUCTS_PUBLISH)
  @ApiOperation({ summary: "Archive (hidden from the storefront; order history unaffected)" })
  async archive(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", productId) id: string,
    @Req() req: Request,
  ): Promise<DetailResponse<ProductDetail>> {
    return {
      data: await this.products.update(
        id,
        this.products.statusChange("archive"),
        this.ctx(auth, store, req),
      ),
      request_id: String(req.id),
    };
  }
}
