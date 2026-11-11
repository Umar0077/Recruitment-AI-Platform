import "reflect-metadata";
import { Logger, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Queue, Worker } from "bullmq";
import { validateEnv, type EnvironmentVariables } from "./config/env.validation";
import { DatabaseModule } from "./database/prisma.service";
import { MAINTENANCE_INTERVAL_MS, MaintenanceModule, MaintenanceService } from "./jobs/maintenance.service";

/**
 * Background worker (Linux servers, with Redis). Runs the same idempotent maintenance as the in-process
 * scheduler, but as a single repeatable BullMQ job so several API replicas never duplicate work.
 * Set JOBS_IN_PROCESS=false on the API when this worker runs.
 */
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DatabaseModule, MaintenanceModule] })
class WorkerModule {}

async function main() {
  process.env.JOBS_IN_PROCESS = "false";
  const logger = new Logger("Worker");
  const ctx = await NestFactory.createApplicationContext(WorkerModule);
  const config = ctx.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  if (!config.get("REDIS_ENABLED", { infer: true })) {
    logger.error("REDIS_ENABLED=false — the worker needs Redis. Use JOBS_IN_PROCESS=true on the API instead.");
    await ctx.close();
    process.exit(1);
  }
  const connection = { host: config.get("REDIS_HOST", { infer: true }), port: config.get("REDIS_PORT", { infer: true }), password: config.get("REDIS_PASSWORD", { infer: true }) || undefined };
  const maintenance = ctx.get(MaintenanceService);

  const queue = new Queue("interviewos-maintenance", { connection });
  await queue.upsertJobScheduler("maintenance", { every: MAINTENANCE_INTERVAL_MS }, { name: "run", opts: { removeOnComplete: 100, removeOnFail: 500 } });
  const worker = new Worker("interviewos-maintenance", () => maintenance.runOnce(), { connection, concurrency: 1 });
  worker.on("failed", (_job, err) => logger.error(`Maintenance job failed: ${err.message}`));
  logger.log("Worker started");

  const stop = async () => {
    await worker.close();
    await queue.close();
    await ctx.close();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

void main();
