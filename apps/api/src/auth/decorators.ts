import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { Permission } from "@cartforge/types";
import type { AuthContext, StoreContext } from "../common/request-context";

export const IS_PUBLIC = "cf:isPublic";
export const REQUIRED_PERMISSIONS = "cf:permissions";
export const STORE_SCOPED = "cf:storeScoped";

/** Endpoint does not require a session (login, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Endpoint requires X-Store-Id and an active membership in that store. */
export const StoreScoped = () => SetMetadata(STORE_SCOPED, true);

/**
 * Endpoint requires all listed permissions in the current store.
 * Implies @StoreScoped().
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.auth) throw new Error("CurrentAuth used on a public route");
    return req.auth;
  },
);

export const CurrentStore = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): StoreContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.store) throw new Error("CurrentStore used on a route without store scope");
    return req.store;
  },
);
