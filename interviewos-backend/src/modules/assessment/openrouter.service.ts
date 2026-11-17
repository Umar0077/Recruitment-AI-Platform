import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import type { EnvironmentVariables } from "../../config/env.validation";
import { usageTelemetry } from "./usage-telemetry";
export class ProviderFailure extends Error {
  constructor(public readonly code: string, public readonly retryAt?: Date) { super(code); }
}
export function providerAllowed(config: Pick<EnvironmentVariables, "AI_ASSESSMENT_ENABLED" | "AI_ASSESSMENT_MODE" | "OPENROUTER_MODEL" | "AI_APPROVED_MODEL" | "AI_PROVIDER_APPROVAL_REFERENCE">, synthetic: boolean) {
  if (!config.AI_ASSESSMENT_ENABLED || config.AI_ASSESSMENT_MODE === "disabled") return false;
  if (synthetic) return true;
  return config.AI_ASSESSMENT_MODE === "approved_production" && !config.OPENROUTER_MODEL.endsWith(":free") && config.AI_APPROVED_MODEL === config.OPENROUTER_MODEL && config.AI_PROVIDER_APPROVAL_REFERENCE.trim().length > 0;
}
export function retryTime(header: string | null, attempt: number, now = Date.now()) {
  const seconds = header === null ? NaN : Number(header);
  const specified = Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Date.parse(header ?? "");
  return new Date(Math.max(now + 1000 * 2 ** attempt + Math.random() * 500, Number.isFinite(specified) ? specified : 0));
}
@Injectable()
export class OpenRouterService {
  constructor(private readonly db: PrismaService, private readonly config: ConfigService<EnvironmentVariables, true>) {}
  get settings() {
    const get = <K extends keyof EnvironmentVariables>(k: K) => this.config.get(k, { infer: true });
    return { AI_ASSESSMENT_ENABLED: get("AI_ASSESSMENT_ENABLED"), AI_ASSESSMENT_MODE: get("AI_ASSESSMENT_MODE"), OPENROUTER_MODEL: get("OPENROUTER_MODEL"), AI_APPROVED_MODEL: get("AI_APPROVED_MODEL"), AI_PROVIDER_APPROVAL_REFERENCE: get("AI_PROVIDER_APPROVAL_REFERENCE") };
  }
  allowed(synthetic = false) { return providerAllowed(this.settings, synthetic); }
  async request(args: { system: string; input: unknown; schema: object; synthetic: boolean; purpose: string; reportId?: string; attempt?: number; validate: (value: unknown) => unknown }) {
    if (!this.allowed(args.synthetic)) throw new ProviderFailure("WAITING_FOR_APPROVED_PROVIDER");
    const key = this.config.get("OPENROUTER_API_KEY", { infer: true });
    if (!key) throw new ProviderFailure("PROVIDER_NOT_CONFIGURED");
    const model = this.settings.OPENROUTER_MODEL;
    const timeout = this.config.get("AI_REQUEST_TIMEOUT_MS", { infer: true });
    const now = new Date();
    const day = new Date(now); day.setUTCHours(0, 0, 0, 0);
    const usage = await this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(5185001)`;
      // Recover reservations after terminated worker processes. Quota consumption is retained.
      await tx.lLMRequestUsage.updateMany({ where: { status: "RESERVED", createdAt: { lt: new Date(now.getTime() - timeout - 30000) } }, data: { status: "ABANDONED", finishedAt: now } });
      const [daily, minute, active] = await Promise.all([
        tx.lLMRequestUsage.count({ where: { createdAt: { gte: day } } }),
        tx.lLMRequestUsage.count({ where: { createdAt: { gte: new Date(now.getTime() - 60000) } } }),
        tx.lLMRequestUsage.count({ where: { status: "RESERVED" } }),
      ]);
      if (daily >= this.config.get("AI_MAX_REQUESTS_PER_DAY", { infer: true })) throw new ProviderFailure("WAITING_FOR_CAPACITY", new Date(day.getTime() + 86400000));
      if (minute >= this.config.get("AI_MAX_REQUESTS_PER_MINUTE", { infer: true }) || active >= this.config.get("AI_MAX_CONCURRENT_REQUESTS", { infer: true })) throw new ProviderFailure("WAITING_FOR_CAPACITY", new Date(now.getTime() + 60000));
      return tx.lLMRequestUsage.create({ data: { model, purpose: args.purpose, reportId: args.reportId, attempt: args.attempt ?? 0 } });
    });
    let httpStatus: number | undefined;
    let telemetry = usageTelemetry(null);
    const started = Date.now();
    try {
      const response = await fetch(`${this.config.get("OPENROUTER_BASE_URL", { infer: true })}/chat/completions`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(timeout),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": this.config.get("OPENROUTER_SITE_URL", { infer: true }), "X-Title": this.config.get("OPENROUTER_APP_NAME", { infer: true }), "X-Request-ID": usage.id },
        body: JSON.stringify({ model, provider: { require_parameters: true, allow_fallbacks: false }, messages: [{ role: "system", content: args.system }, { role: "user", content: JSON.stringify(args.input) }], temperature: 0.2, max_tokens: 4000, response_format: { type: "json_schema", json_schema: { name: "interviewos", strict: true, schema: args.schema } } }),
      });
      httpStatus = response.status;
      if (!response.ok) throw new ProviderFailure(response.status === 429 ? "RATE_LIMITED" : response.status === 401 || response.status === 403 ? "PROVIDER_AUTH_FAILED" : response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REQUEST_REJECTED", response.status === 429 || response.status >= 500 ? retryTime(response.headers.get("retry-after"), args.attempt ?? 0) : undefined);
      const body = await response.json() as { choices?: { finish_reason?: string; message?: { content?: string } }[]; error?: unknown };
      telemetry = usageTelemetry(body);
      if (body.error || body.choices?.[0]?.finish_reason !== "stop" || !body.choices[0].message?.content) throw new ProviderFailure("INVALID_OUTPUT");
      const content: unknown = JSON.parse(body.choices[0].message.content);
      args.validate(content);
      await this.db.lLMRequestUsage.update({ where: { id: usage.id }, data: { status: "SUCCEEDED", httpStatus, ...telemetry, latencyMs: Date.now() - started, finishedAt: new Date() } });
      return content;
    } catch (error) {
      const errorName = error && typeof error === "object" && "name" in error ? String(error.name) : "";
      const failure = error instanceof ProviderFailure ? error : ["TimeoutError", "AbortError", "TypeError"].includes(errorName) ? new ProviderFailure("PROVIDER_UNAVAILABLE", retryTime(null, args.attempt ?? 0)) : new ProviderFailure("INVALID_OUTPUT");
      await this.db.lLMRequestUsage.update({ where: { id: usage.id }, data: { status: failure.code, httpStatus, ...telemetry, latencyMs: Date.now() - started, finishedAt: new Date() } });
      throw failure; // Only controlled codes escape; no response bodies, credentials, or transcripts.
    }
  }
  async usage() {
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    const where = { createdAt: { gte: day } };
    const [total, succeeded, failed, rateLimitErrors, retries, pendingJobs] = await Promise.all([
      this.db.lLMRequestUsage.aggregate({ where, _count: { _all: true }, _sum: { tokens: true }, _avg: { latencyMs: true } }),
      this.db.lLMRequestUsage.count({ where: { ...where, status: "SUCCEEDED" } }),
      this.db.lLMRequestUsage.count({ where: { ...where, status: { notIn: ["RESERVED", "SUCCEEDED"] } } }),
      this.db.lLMRequestUsage.count({ where: { ...where, httpStatus: 429 } }),
      this.db.lLMRequestUsage.count({ where: { ...where, attempt: { gt: 0 } } }),
      this.db.assessmentReport.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
    ]);
    const requestsToday = total._count._all;
    return { provider: "OpenRouter", model: this.settings.OPENROUTER_MODEL, mode: this.settings.AI_ASSESSMENT_MODE, budgetType: "Application budget, not provider quota (UTC day)", requestsToday, remainingBudget: Math.max(0, this.config.get("AI_MAX_REQUESTS_PER_DAY", { infer: true }) - requestsToday), succeeded, failed, rateLimitErrors, retries, tokens: total._sum.tokens ?? 0, averageLatencyMs: total._avg.latencyMs, pendingJobs };
  }
}
