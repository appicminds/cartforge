import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { AuditModule } from "./audit/audit.service";
import { AuthModule } from "./auth/auth.module";
import { HttpExceptionFilter } from "./common/http-exception.filter";
import { loggerParams } from "./common/logger";
import { ConfigModule } from "./config/config.module";
import { API_ENV, type ApiEnv } from "./config/env";
import { HealthModule } from "./health/health.controller";
import { PrismaModule } from "./prisma/prisma.service";
import { CatalogModule } from "./catalog/catalog.module";
import { OutboxModule } from "./common/outbox.service";
import { InventoryModule } from "./inventory/inventory.module";
import { MediaModule } from "./media/media.module";
import { ProductsModule } from "./products/products.module";
import { StorageModule } from "./storage/storage.module";
import { StorefrontModule } from "./storefront/storefront.module";
import { RedisModule } from "./redis/redis.service";
import { StoresModule } from "./stores/stores.module";

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => loggerParams(env),
    }),
    PrismaModule,
    RedisModule,
    AuditModule,
    AuthModule,
    HealthModule,
    StoresModule,
    StorageModule,
    MediaModule,
    InventoryModule,
    OutboxModule,
    CatalogModule,
    StorefrontModule,
    ProductsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
