import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { validateEnv, type EnvironmentVariables } from "./config/env.validation";
import { DatabaseModule } from "./database/prisma.service";
import { AccessScopeModule } from "./common/access-scope";
import { AllExceptionsFilter, ResponseEnvelopeInterceptor } from "./common/http";
import { AuthModule } from "./modules/auth/auth.module";
import { AuthGuard } from "./modules/auth/auth.guard";
import { AuditModule } from "./modules/audit/audit.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { QuestionSetsModule } from "./modules/question-sets/question-sets.module";
import { CandidatesModule } from "./modules/candidates/candidates.module";
import { InterviewsModule } from "./modules/interviews/interviews.module";
import { RecruitmentModule } from "./modules/recruitment/recruitment.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { HealthModule } from "./modules/health/health.module";
import { UsersModule } from "./modules/users/users.module";
import { CareersIntegrationModule } from "./modules/integrations/careers.module";
import { StorageModule } from "./integrations/storage/storage.module";
import { MaintenanceModule } from "./jobs/maintenance.service";

const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        pinoHttp: {
          level: config.get("LOG_LEVEL", { infer: true }),
          genReqId: (req: IncomingMessage) => {
            const incoming = req.headers["x-request-id"];
            return typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
          },
          // Never log credentials, bodies (answers/transcripts), or cookies.
          redact: { paths: ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-integration-key"]', "req.body", 'res.headers["set-cookie"]'], censor: "[redacted]" },
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url?.split("?")[0] }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          autoLogging: { ignore: (req: IncomingMessage) => !!req.url?.includes("/health") },
          transport: config.get("NODE_ENV", { infer: true }) === "development" ? { target: "pino-pretty", options: { singleLine: true } } : undefined,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => [{ name: "default", ttl: 60_000, limit: config.get("RATE_LIMIT_PER_MINUTE", { infer: true }) }],
    }),
    DatabaseModule,
    AccessScopeModule,
    AuthModule,
    AuditModule,
    NotificationsModule,
    StorageModule,
    MaintenanceModule,
    QuestionSetsModule,
    CandidatesModule,
    InterviewsModule,
    RecruitmentModule,
    AnalyticsModule,
    UsersModule,
    CareersIntegrationModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate-limit before doing any token verification work.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
