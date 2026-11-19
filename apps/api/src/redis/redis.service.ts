import { Global, Inject, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { API_ENV, type ApiEnv } from "../config/env";

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(@Inject(API_ENV) env: ApiEnv) {
    super(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
