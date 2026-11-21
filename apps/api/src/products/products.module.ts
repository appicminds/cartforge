import { StoreTransferController } from "./store-transfer.controller";
import { StoreCurrencyService } from "./store-currency.service";
import { StoreTransferService } from "./store-transfer.service";
import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { InventoryModule } from "../inventory/inventory.module";
import { MediaModule } from "../media/media.module";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { VariantsController } from "./variants.controller";
import { VariantsService } from "./variants.service";
import { ProductActivityService } from "./activity.service";

@Module({
  imports: [MediaModule, InventoryModule, CatalogModule],
  controllers: [ProductsController, VariantsController, StoreTransferController],
  providers: [
    ProductsService,
    VariantsService,
    ProductActivityService,
    StoreTransferService,
    StoreCurrencyService,
  ],
})
export class ProductsModule {}
