import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { API_ENV, type ApiEnv } from "../config/env";
import { PreviewTokens } from "./preview-token";
import { StorefrontRevalidationInterceptor, StorefrontRevalidator } from "./revalidation";
import { StorefrontController } from "./storefront.controller";
import { StorefrontService } from "./storefront.service";

@Global()
@Module({
  controllers: [StorefrontController],
  providers: [
    StorefrontService,
    StorefrontRevalidator,
    {
      provide: PreviewTokens,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => new PreviewTokens(env.SESSION_SECRET),
    },
    { provide: APP_INTERCEPTOR, useClass: StorefrontRevalidationInterceptor },
  ],
  exports: [PreviewTokens, StorefrontRevalidator],
})
export class StorefrontModule {}
