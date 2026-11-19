import { Global, Module } from "@nestjs/common";
import { loadApiEnv } from "@cartforge/config";
import { API_ENV } from "./env";

@Global()
@Module({
  providers: [{ provide: API_ENV, useFactory: () => loadApiEnv() }],
  exports: [API_ENV],
})
export class ConfigModule {}
