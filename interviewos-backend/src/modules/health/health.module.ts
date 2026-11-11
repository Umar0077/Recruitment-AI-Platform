import { Controller, Get, HttpStatus, Module, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { PrismaService } from "../../database/prisma.service";
import { Public } from "../../common/decorators";
import type { EnvironmentVariables } from "../../config/env.validation";
import { RedisProbe } from "../../integrations/redis/redis-probe";

/** Liveness and readiness. No versions, hostnames or configuration are exposed. */
@ApiTags("health")
@Public()
@SkipThrottle()
@Controller("health")
class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService<EnvironmentVariables, true>, private readonly redis: RedisProbe) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get()
  ready0(@Res({ passthrough: true }) res: Response) {
    return this.ready(res);
  }

  @Get("ready")
  async ready(@Res({ passthrough: true }) res: Response) {
    const database = await this.prisma.$queryRaw`SELECT 1`.then(() => "up" as const, () => "down" as const);
    const redis = this.config.get("REDIS_ENABLED", { infer: true }) ? await this.redis.ping() : ("disabled" as const);
    const ok = database === "up" && redis !== "down";
    if (!ok) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? "ok" : "degraded", checks: { database, redis } };
  }
}

@Module({ controllers: [HealthController], providers: [RedisProbe] })
export class HealthModule {}
