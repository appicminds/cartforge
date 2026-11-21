import { Global, Module } from "@nestjs/common";
import { SalesController, SalesCronController } from "./sales.controller";
import { SalesService } from "./sales.service";

/** Sales: bulk price changes with scheduled start and end (Discounts → Sales). */
@Global()
@Module({
  controllers: [SalesController, SalesCronController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
