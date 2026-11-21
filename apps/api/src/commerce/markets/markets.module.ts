import { Global, Module } from "@nestjs/common";
import { fetchHttp } from "../payments/provider";
import { FX_HTTP, FxService } from "./fx.service";
import { MarketsController, StorefrontMarketsController } from "./markets.controller";
import { MarketsService } from "./markets.service";

/** Markets: countries, currencies and prices per market (used by catalog and checkout). */
@Global()
@Module({
  controllers: [MarketsController, StorefrontMarketsController],
  providers: [MarketsService, FxService, { provide: FX_HTTP, useValue: fetchHttp }],
  exports: [MarketsService, FxService],
})
export class MarketsModule {}
