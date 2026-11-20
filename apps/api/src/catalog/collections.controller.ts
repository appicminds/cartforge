import { InvalidatesStorefront } from "../storefront/revalidation";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiZodBody } from "../common/openapi";
import type { Request } from "express";
import {
  CATALOG_ERROR_CODES,
  PERMISSIONS,
  type CollectionDetail,
  type CollectionSummary,
  type DetailResponse,
  type ListResponse,
} from "@cartforge/types";
import {
  collectionCreateSchema,
  collectionListQuerySchema,
  collectionProductsSchema,
  collectionUpdateSchema,
  type CollectionCreate,
  type CollectionListQuery,
  type CollectionProducts,
  type CollectionUpdate,
} from "@cartforge/validation";
import { CurrentAuth, CurrentStore, RequirePermissions } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import type { AuthContext, StoreContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { CatalogActor } from "./categories.service";
import { CollectionsService } from "./collections.service";

const collectionId = new ParseUUIDPipe({
  exceptionFactory: () =>
    new AppException(
      CATALOG_ERROR_CODES.COLLECTION_NOT_FOUND,
      "Collection not found.",
      HttpStatus.NOT_FOUND,
    ),
});

@ApiTags("collections")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true, description: "Store scope (UUID)" })
@InvalidatesStorefront()
@Controller("collections")
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  private actor(auth: AuthContext, store: StoreContext, req: Request): CatalogActor {
    return { store_id: store.store_id, user_id: auth.user_id, request_id: String(req.id) };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({ summary: "List collections" })
  async list(
    @CurrentStore() store: StoreContext,
    @Query(new ZodValidationPipe(collectionListQuerySchema)) q: CollectionListQuery,
    @Req() req: Request,
  ): Promise<ListResponse<CollectionSummary>> {
    return { ...(await this.collections.list(store.store_id, q)), request_id: String(req.id) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COLLECTIONS_WRITE)
  @ApiOperation({ summary: "Create a manual collection" })
  @ApiZodBody(collectionCreateSchema)
  async create(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Body(new ZodValidationPipe(collectionCreateSchema)) body: CollectionCreate,
    @Req() req: Request,
  ): Promise<DetailResponse<CollectionDetail>> {
    return {
      data: await this.collections.create(body, this.actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Get(":id")
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({ summary: "Collection with its ordered products" })
  async get(
    @CurrentStore() store: StoreContext,
    @Param("id", collectionId) id: string,
    @Req() req: Request,
  ): Promise<DetailResponse<CollectionDetail>> {
    return { data: await this.collections.get(store.store_id, id), request_id: String(req.id) };
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.COLLECTIONS_WRITE)
  @ApiOperation({
    summary:
      "Update a collection (live handle changes need confirm_handle_change and create a redirect)",
  })
  @ApiZodBody(collectionUpdateSchema)
  async update(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", collectionId) id: string,
    @Body(new ZodValidationPipe(collectionUpdateSchema)) body: CollectionUpdate,
    @Req() req: Request,
  ): Promise<DetailResponse<CollectionDetail>> {
    return {
      data: await this.collections.update(id, body, this.actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Put(":id/products")
  @RequirePermissions(PERMISSIONS.COLLECTIONS_WRITE)
  @ApiOperation({ summary: "Replace collection membership (order = display order)" })
  @ApiZodBody(collectionProductsSchema)
  async setProducts(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", collectionId) id: string,
    @Body(new ZodValidationPipe(collectionProductsSchema)) body: CollectionProducts,
    @Req() req: Request,
  ): Promise<DetailResponse<CollectionDetail>> {
    return {
      data: await this.collections.setProducts(id, body, this.actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Delete(":id")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.COLLECTIONS_WRITE)
  @ApiOperation({ summary: "Delete a collection (products are not affected)" })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", collectionId) id: string,
    @Req() req: Request,
  ): Promise<{ data: { id: string; deleted: true }; request_id: string }> {
    await this.collections.remove(id, this.actor(auth, store, req));
    return { data: { id, deleted: true }, request_id: String(req.id) };
  }
}
