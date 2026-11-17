import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "../src/database/prisma.service";
import { validateEnv } from "../src/config/env.validation";
import { OpenRouterService } from "../src/modules/assessment/openrouter.service";
import { FINDINGS_SCHEMA, SYSTEM_PROMPT, validateFindings } from "../src/modules/assessment/contracts";
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DatabaseModule], providers: [OpenRouterService] })
class SmokeModule {}
async function main() {
  if (process.env.RUN_OPENROUTER_SMOKE !== "true") { console.log("Skipped: set RUN_OPENROUTER_SMOKE=true to send a fixed fictional fixture."); return; }
  if (!process.env.OPENROUTER_API_KEY) { console.log("Skipped: backend OPENROUTER_API_KEY is not configured."); return; }
  const app = await NestFactory.createApplicationContext(SmokeModule, { logger: false });
  try {
    const provider = app.get(OpenRouterService);
    const models = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(15000) }).then(r => r.json()) as { data: { id: string; supported_parameters: string[]; architecture: { input_modalities: string[] } }[] };
    const model = models.data.find(m => m.id === provider.settings.OPENROUTER_MODEL);
    if (!model || !model.architecture.input_modalities.includes("text") || !model.supported_parameters.includes("structured_outputs")) throw new Error("MODEL_CAPABILITY_UNAVAILABLE");
    const input = [{ questionId: "synthetic-only", question: "How would you clarify a fictional customer's needs?", answer: "I would ask what they need, listen carefully, and respect their choice to stop." }];
    const started = Date.now();
    await provider.request({ system: SYSTEM_PROMPT, input, schema: FINDINGS_SCHEMA, synthetic: true, purpose: "synthetic_smoke", validate: value => validateFindings(value, input) });
    console.log({ result: "validated", model: model.id, latencyMs: Date.now() - started, usage: await provider.usage() });
  } finally { await app.close(); }
}
main().catch(() => { console.error("Synthetic smoke failed; inspect sanitized request usage. No model fallback was attempted."); process.exitCode = 1; });
