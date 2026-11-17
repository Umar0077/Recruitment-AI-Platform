/** Read-only metadata diagnostic. No completion, candidate data, persistence, or raw error output. */
import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { ConfigService } from "@nestjs/config";
import { validateEnv, EnvironmentVariables } from "../src/config/env.validation";
import { ProviderMetadataService } from "../src/modules/assessment/provider-metadata.service";
import { providerAllowed } from "../src/modules/assessment/openrouter.service";

async function main() {
  const env = validateEnv({ ...parse(readFileSync(resolve(__dirname, "../.env"))), ...process.env });
  const started = Date.now();
  const data = await new ProviderMetadataService(new ConfigService<EnvironmentVariables, true>(env)).get();
  process.stdout.write(JSON.stringify({ status: data.status, keyStatus: data.key.status, creditsStatus: data.credits.status, model: data.model.id, modelAvailability: data.model.availability, pricingCategory: data.model.pricingCategory, inputCostPerMillion: data.model.inputCostPerMillion, outputCostPerMillion: data.model.outputCostPerMillion, requestCostUsd: data.model.requestCostUsd, contextWindow: data.model.contextWindow, quotaSource: data.freeQuota.source, quotaResetSource: data.freeQuota.resetSource, candidateDataAllowed: providerAllowed(env, false), elapsedMs: Date.now() - started, errors: data.errors, completionRequests: 0, databaseWrites: 0 }, null, 2) + "\n");
}
void main().catch(() => { process.stderr.write("OpenRouter metadata check failed before provider access; diagnostic details suppressed.\n"); process.exitCode = 1; });
