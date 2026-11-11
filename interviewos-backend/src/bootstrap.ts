import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import type { EnvironmentVariables } from "./config/env.validation";

/** Applies the HTTP hardening shared by main.ts and the e2e tests. */
export function configureApp(app: NestExpressApplication): INestApplication {
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const prod = config.get("NODE_ENV", { infer: true }) === "production";

  app.useLogger(app.get(Logger));
  app.disable("x-powered-by");
  if (config.get("TRUST_PROXY", { infer: true })) app.set("trust proxy", 1); // real client IP behind Nginx, for rate limiting
  app.use(helmet({ contentSecurityPolicy: prod ? undefined : false, crossOriginResourcePolicy: { policy: "same-site" } }));
  app.useBodyParser("json", { limit: "100kb" });
  app.useBodyParser("urlencoded", { limit: "20kb", extended: false });

  const origins = config.get("FRONTEND_ORIGINS", { infer: true }).split(",").map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    // Exact-match allowlist. Auth uses bearer tokens, so cookies/credentials are not needed.
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    exposedHeaders: ["X-Request-Id"],
    credentials: false,
    maxAge: 600,
  });

  app.setGlobalPrefix(config.get("API_PREFIX", { infer: true }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false }, stopAtFirstError: false }));
  app.enableShutdownHooks();

  if (config.get("SWAGGER_ENABLED", { infer: true })) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("InterviewOS API")
        .setDescription("InterviewOS REST API v1. All responses use { success, data, meta } or { success: false, error: { code, message } }.")
        .setVersion("1.0")
        .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "Firebase ID token" })
        .build(),
    );
    SwaggerModule.setup("api/docs", app, doc, { jsonDocumentUrl: "api/docs-json", swaggerOptions: { persistAuthorization: false } });
  }
  return app;
}
