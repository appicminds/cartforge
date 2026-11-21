import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InventoryModule } from "../inventory/inventory.module";
import { OrdersModule } from "../orders/order-snapshot.service";
import { CommerceAdminController } from "./admin.controller";
import { OrderActionsController } from "./order-actions.controller";
import { CartService } from "./cart.service";
import { CheckoutService } from "./checkout.service";
import { IdempotencyService } from "./idempotency.service";
import { OrdersService } from "./orders.service";
import { OrderActionsService } from "./order-actions.service";
import { OrderMailer } from "./order-mailer";
import { ReservationsService } from "./reservations.service";
import { CommerceSettingsService } from "./settings.service";
import { StorefrontCommerceController } from "./storefront-commerce.controller";

/** Next 4: cart, checkout, orders, checkout settings and shipping methods. */
@Module({
  imports: [AuthModule, InventoryModule, OrdersModule],
  controllers: [StorefrontCommerceController, CommerceAdminController, OrderActionsController],
  providers: [
    CartService,
    CheckoutService,
    CommerceSettingsService,
    IdempotencyService,
    OrdersService,
    OrderActionsService,
    OrderMailer,
    ReservationsService,
  ],
  exports: [ReservationsService],
})
export class CommerceModule {}
