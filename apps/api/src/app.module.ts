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
import { CommerceModule } from "./commerce/commerce.module";
import { MarketsModule } from "./commerce/markets/markets.module";
import { SalesModule } from "./commerce/sales/sales.module";
import { PlatformModule } from "./platform/platform.module";
import { OutboxModule } from "./common/outbox.service";
import { InventoryModule } from "./inventory/inventory.module";
import { OrdersModule } from "./orders/order-snapshot.service";
import { MediaModule } from "./media/media.module";
import { MailModule } from "./mail/mail.module";
import { StaffModule } from "./staff/staff.module";
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
    PlatformModule,
    AuthModule,
    HealthModule,
    StoresModule,
    StorageModule,
    MailModule,
    MediaModule,
    InventoryModule,
    OutboxModule,
    CatalogModule,
    StorefrontModule,
    OrdersModule,
    ProductsModule,
    StaffModule,
    MarketsModule,
    SalesModule,
    CommerceModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
