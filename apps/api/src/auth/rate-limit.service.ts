import { HttpStatus, Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@cartforge/types";
import { AppException } from "../common/app-exception";
import { RedisService } from "../redis/redis.service";

/** Fixed-window limiter backed by Redis (PRD §23 rate limiting on login). */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<void> {
    const redisKey = `ratelimit:${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) await this.redis.expire(redisKey, windowSeconds);
    if (count > limit) {
      throw new AppException(
        ERROR_CODES.RATE_LIMITED,
        "Too many attempts. Please wait a few minutes and try again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`ratelimit:${key}`);
  }
}
