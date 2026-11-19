import { Controller, Get, HttpStatus, Module, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Public } from "../auth/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

type Check = { status: "ok" | "error"; latency_ms: number };

async function timed(fn: () => Promise<unknown>): Promise<Check> {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000)),
    ]);
    return { status: "ok", latency_ms: Date.now() - start };
  } catch {
    return { status: "error", latency_ms: Date.now() - start };
  }
}

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "Liveness: the API process is up." })
  live() {
    return { status: "ok", service: "api", version: process.env.npm_package_version ?? "0.0.0" };
  }

  @Public()
  @Get("ready")
  @ApiOperation({ summary: "Readiness: database and Redis are reachable." })
  async ready(@Res({ passthrough: true }) res: Response) {
    const [database, redis] = await Promise.all([
      timed(() => this.prisma.$queryRaw`SELECT 1`),
      timed(() => this.redis.ping()),
    ]);
    const ok = database.status === "ok" && redis.status === "ok";
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? "ok" : "degraded", checks: { database, redis } };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
