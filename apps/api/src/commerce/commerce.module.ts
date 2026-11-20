import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InventoryModule } from "../inventory/inventory.module";
import { OrdersModule } from "../orders/order-snapshot.service";
import { CommerceAdminController } from "./admin.controller";
import { CartService } from "./cart.service";
import { CheckoutService } from "./checkout.service";
import { IdempotencyService } from "./idempotency.service";
import { OrdersService } from "./orders.service";
import { ReservationsService } from "./reservations.service";
import { CommerceSettingsService } from "./settings.service";
import { StorefrontCommerceController } from "./storefront-commerce.controller";

/** Next 4: cart, checkout, orders, checkout settings and shipping methods. */
@Module({
  imports: [AuthModule, InventoryModule, OrdersModule],
  controllers: [StorefrontCommerceController, CommerceAdminController],
  providers: [
    CartService,
    CheckoutService,
    CommerceSettingsService,
    IdempotencyService,
    OrdersService,
    ReservationsService,
  ],
  exports: [ReservationsService],
})
export class CommerceModule {}
