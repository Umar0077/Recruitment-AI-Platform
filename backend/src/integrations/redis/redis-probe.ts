import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../../config/env.validation";

/** Lazily opens one Redis connection for health checks. Only used when REDIS_ENABLED=true. */
@Injectable()
export class RedisProbe implements OnModuleDestroy {
  private client?: import("ioredis").Redis;
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  async ping(): Promise<"up" | "down"> {
    try {
      if (!this.client) {
        const { Redis } = await import("ioredis");
        this.client = new Redis({
          host: this.config.get("REDIS_HOST", { infer: true }),
          port: this.config.get("REDIS_PORT", { infer: true }),
          password: this.config.get("REDIS_PASSWORD", { infer: true }) || undefined,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
        });
        await this.client.connect();
      }
      return (await this.client.ping()) === "PONG" ? "up" : "down";
    } catch {
      return "down";
    }
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined);
  }
}
