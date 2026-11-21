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
import { CustomersController } from "./customers/customers.controller";
import { DiscountsController } from "./discounts/discounts.controller";
import { DiscountsService } from "./discounts/discounts.service";
import { CustomersService } from "./customers/customers.service";
import { CustomerAccountsController } from "./customers/customer-accounts.controller";
import { CustomerAccountsService } from "./customers/customer-accounts.service";
import { PaymentAccountsService } from "./payments/accounts.service";
import { PaymentHubService } from "./payments/payment-hub.service";
import {
  PaymentWebhooksController,
  PaymentsAdminController,
  StorefrontPaymentsController,
} from "./payments/payments.controller";
import { PAYMENT_HTTP, fetchHttp } from "./payments/provider";
import { ReservationsService } from "./reservations.service";
import { CommerceSettingsService } from "./settings.service";
import { StorefrontCommerceController } from "./storefront-commerce.controller";

/** Next 4: cart, checkout, orders, checkout settings and shipping methods. */
@Module({
  imports: [AuthModule, InventoryModule, OrdersModule],
  controllers: [
    StorefrontCommerceController,
    CommerceAdminController,
    OrderActionsController,
    PaymentsAdminController,
    PaymentWebhooksController,
    StorefrontPaymentsController,
    CustomersController,
    DiscountsController,
    CustomerAccountsController,
  ],
  providers: [
    CartService,
    CheckoutService,
    CommerceSettingsService,
    IdempotencyService,
    OrdersService,
    OrderActionsService,
    OrderMailer,
    CustomersService,
    DiscountsService,
    CustomerAccountsService,
    PaymentAccountsService,
    PaymentHubService,
    { provide: PAYMENT_HTTP, useValue: fetchHttp },
    ReservationsService,
  ],
  exports: [ReservationsService],
})
export class CommerceModule {}
