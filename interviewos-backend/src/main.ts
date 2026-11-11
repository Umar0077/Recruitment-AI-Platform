import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
import type { EnvironmentVariables } from "./config/env.validation";

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app);
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const port = config.get("PORT", { infer: true });
  // Bind to loopback by default; in a container set HOST=0.0.0.0 and keep the port private behind Nginx.
  await app.listen(port, process.env.HOST ?? "127.0.0.1");
}

void main();
