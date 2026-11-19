import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { MediaModule } from "../media/media.module";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { VariantsController } from "./variants.controller";
import { VariantsService } from "./variants.service";

@Module({
  imports: [MediaModule, InventoryModule],
  controllers: [ProductsController, VariantsController],
  providers: [ProductsService, VariantsService],
})
export class ProductsModule {}
