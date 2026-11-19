/** Reports only booleans/non-secret policy settings. Never prints environment values or SDK errors. */
import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { ConfigService } from "@nestjs/config";
import { validateEnv, type EnvironmentVariables } from "../src/config/env.validation";
import { RecordingStorage } from "../src/integrations/storage/recording-storage";
async function main() {
  const env = validateEnv(parse(readFileSync(resolve(__dirname, "../.env"))));
  const storage = new RecordingStorage(new ConfigService<EnvironmentVariables, true>(env));
  process.stdout.write(JSON.stringify({ enabled: env.RECORDING_ENABLED, uploadEnabled: env.RECORDING_UPLOAD_ENABLED, monitoringEnabled: env.RECORDING_MONITORING_ENABLED, approvedRetentionConfigured: env.RECORDING_RETENTION_DAYS > 0, policyReferenceConfigured: !!env.RECORDING_POLICY_REFERENCE.trim(), supportContactConfigured: !!env.RECORDING_SUPPORT_EMAIL.trim(), storageCredentialsConfigured: storage.configured, privateStorageReady: storage.configured ? await storage.ready() : false, mediaCaptured: false, databaseWrites: 0 }) + "\n");
}
void main().catch(() => { process.stderr.write("Recording configuration validation failed; secret values suppressed.\n"); process.exitCode = 1; });
