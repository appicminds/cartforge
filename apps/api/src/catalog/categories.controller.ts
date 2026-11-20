import { InvalidatesStorefront } from "../storefront/revalidation";
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
  HttpStatus,
} from "@nestjs/common";
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiZodBody } from "../common/openapi";
import type { Request } from "express";
import {
  CATALOG_ERROR_CODES,
  PERMISSIONS,
  type CategorySummary,
  type DetailResponse,
} from "@cartforge/types";
import {
  categoryCreateSchema,
  categoryDeleteSchema,
  categoryReorderSchema,
  categoryUpdateSchema,
  type CategoryCreate,
  type CategoryDelete,
  type CategoryReorder,
  type CategoryUpdate,
} from "@cartforge/validation";
import { CurrentAuth, CurrentStore, RequirePermissions } from "../auth/decorators";
import { AppException } from "../common/app-exception";
import type { AuthContext, StoreContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CategoriesService, type CatalogActor } from "./categories.service";

const categoryId = new ParseUUIDPipe({
  exceptionFactory: () =>
    new AppException(
      CATALOG_ERROR_CODES.CATEGORY_NOT_FOUND,
      "Category not found.",
      HttpStatus.NOT_FOUND,
    ),
});

@ApiTags("categories")
@ApiCookieAuth()
@ApiHeader({ name: "X-Store-Id", required: true, description: "Store scope (UUID)" })
@InvalidatesStorefront()
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  private actor(auth: AuthContext, store: StoreContext, req: Request): CatalogActor {
    return { store_id: store.store_id, user_id: auth.user_id, request_id: String(req.id) };
  }

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({
    summary: "All categories as a depth-first tree (with depth, path and product counts)",
  })
  async list(
    @CurrentStore() store: StoreContext,
    @Req() req: Request,
  ): Promise<{ data: CategorySummary[]; request_id: string }> {
    return { data: await this.categories.list(store.store_id), request_id: String(req.id) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATEGORIES_WRITE)
  @ApiOperation({ summary: "Create a category (optional parent; nesting up to 3 levels)" })
  @ApiZodBody(categoryCreateSchema)
  async create(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Body(new ZodValidationPipe(categoryCreateSchema)) body: CategoryCreate,
    @Req() req: Request,
  ): Promise<DetailResponse<CategorySummary>> {
    return {
      data: await this.categories.create(body, this.actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Post("reorder")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CATEGORIES_WRITE)
  @ApiOperation({ summary: "Reorder the children of one parent" })
  @ApiZodBody(categoryReorderSchema)
  async reorder(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Body(new ZodValidationPipe(categoryReorderSchema)) body: CategoryReorder,
    @Req() req: Request,
  ): Promise<{ data: CategorySummary[]; request_id: string }> {
    return {
      data: await this.categories.reorder(body, this.actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.CATEGORIES_WRITE)
  @ApiOperation({ summary: "Update a category (moving it validates depth and cycles)" })
  @ApiZodBody(categoryUpdateSchema)
  async update(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", categoryId) id: string,
    @Body(new ZodValidationPipe(categoryUpdateSchema)) body: CategoryUpdate,
    @Req() req: Request,
  ): Promise<DetailResponse<CategorySummary>> {
    return {
      data: await this.categories.update(id, body, this.actor(auth, store, req)),
      request_id: String(req.id),
    };
  }

  @Post(":id/delete")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CATEGORIES_WRITE)
  @ApiOperation({
    summary: "Delete a category",
    description:
      "Body: { reassign_to } or { unassign: true } when products are assigned (409 CATEGORY_HAS_PRODUCTS otherwise).",
  })
  @ApiZodBody(categoryDeleteSchema)
  async removeWithBody(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", categoryId) id: string,
    @Body(new ZodValidationPipe(categoryDeleteSchema)) body: CategoryDelete,
    @Req() req: Request,
  ): Promise<{ data: { id: string; deleted: true }; request_id: string }> {
    await this.categories.remove(id, body, this.actor(auth, store, req));
    return { data: { id, deleted: true }, request_id: String(req.id) };
  }

  @Delete(":id")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.CATEGORIES_WRITE)
  @ApiOperation({
    summary: "Delete an empty category (use POST :id/delete to reassign or unassign products)",
  })
  async remove(
    @CurrentAuth() auth: AuthContext,
    @CurrentStore() store: StoreContext,
    @Param("id", categoryId) id: string,
    @Req() req: Request,
  ): Promise<{ data: { id: string; deleted: true }; request_id: string }> {
    await this.categories.remove(id, {}, this.actor(auth, store, req));
    return { data: { id, deleted: true }, request_id: String(req.id) };
  }
}
