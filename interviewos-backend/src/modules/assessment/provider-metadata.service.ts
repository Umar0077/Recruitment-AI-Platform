import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../../config/env.validation";
import { money, tokenCount } from "./usage-telemetry";

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const timestamp = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const price = (value: unknown) => typeof value === "string" && value.trim() !== "" ? money(Number(value)) : money(value);
type MetadataStatus = "available" | "unavailable" | "unconfigured";

export function modelMetadata(body: unknown, id: string, available: boolean) {
  const data = object(body).data;
  const entry = Array.isArray(data) ? data.map(object).find(row => row.id === id) : undefined;
  const pricing = object(entry?.pricing);
  const input = price(pricing.prompt), output = price(pricing.completion), request = price(pricing.request);
  const allPrices = Object.values(pricing).map(price);
  // The catalog may omit a per-request price. Classify reported prices, while leaving missing dimensions null.
  const pricingCategory = !entry || input === null || output === null ? "unknown" : allPrices.some(value => value !== null && value > 0) ? "paid" : allPrices.every(value => value !== null && value === 0) ? "free" : "unknown";
  return { id, name: typeof entry?.name === "string" ? entry.name.slice(0, 200) : null, availability: entry ? "available" : available && Array.isArray(data) ? "unavailable" : "unknown", pricingCategory, inputCostPerMillion: input === null ? null : input * 1000000, outputCostPerMillion: output === null ? null : output * 1000000, requestCostUsd: request, contextWindow: tokenCount(entry?.context_length) };
}
export function keyMetadata(body: unknown, status: MetadataStatus) {
  const data = object(object(body).data), budget = object(data.effective_budget);
  // budgetResetAt belongs to the effective spend budget (possibly workspace/member/guardrail), not necessarily the key's limitReset.
  return { status, usageUsd: money(data.usage), dailyUsageUsd: money(data.usage_daily), monthlyUsageUsd: money(data.usage_monthly), limitUsd: money(data.limit), remainingUsd: money(data.limit_remaining), limitReset: ["daily", "weekly", "monthly"].includes(String(data.limit_reset)) ? String(data.limit_reset) : null, expiresAt: timestamp(data.expires_at), budgetResetAt: timestamp(budget.resets_at) };
}
export function creditMetadata(body: unknown, status: MetadataStatus) {
  const data = object(object(body).data), totalCreditsUsd = money(data.total_credits), totalUsageUsd = money(data.total_usage);
  return { status, totalCreditsUsd, totalUsageUsd, remainingUsd: totalCreditsUsd !== null && totalUsageUsd !== null ? totalCreditsUsd - totalUsageUsd : null };
}
export function quotaMetadata(body: unknown) {
  const quota = object(object(object(body).data).free_model_daily_requests);
  const limit = tokenCount(quota.limit), used = tokenCount(quota.used), remaining = tokenCount(quota.remaining);
  const known = limit !== null && used !== null && remaining !== null;
  // Never substitute key expiration or spend-budget reset for a free-request quota reset.
  const resetAt = timestamp(quota.resets_at);
  return { limit, used, remaining, source: known ? "provider" : "unavailable", resetAt, resetSource: resetAt ? "provider" : "unavailable", message: known ? "Free-model daily request counts reported by OpenRouter. Other applications using the same account may consume this quota." : "OpenRouter did not return a complete free-model daily request quota. Application limits and key credit budgets are shown separately." };
}
@Injectable()
export class ProviderMetadataService {
  private cached?: { expiresAt: number; value: Awaited<ReturnType<ProviderMetadataService["load"]>> };
  private pending?: Promise<Awaited<ReturnType<ProviderMetadataService["load"]>>>;
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}
  get() {
    if (this.cached && this.cached.expiresAt > Date.now()) return Promise.resolve(this.cached.value);
    if (this.pending) return this.pending;
    this.pending = this.load().then(value => { this.cached = { expiresAt: Date.now() + 300000, value }; return value; }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async read(path: "/key" | "/credits" | "/models", key?: string) {
    try {
      const response = await fetch(`${this.config.get("OPENROUTER_BASE_URL", { infer: true })}${path}`, { method: "GET", redirect: "error", signal: AbortSignal.timeout(8000), headers: key ? { Authorization: `Bearer ${key}` } : {} });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      const data = object(body).data;
      return path === "/models" ? Array.isArray(data) ? body : null : data && typeof data === "object" && !Array.isArray(data) ? body : null;
    } catch { return null; } // Raw provider messages can contain key identifiers. Expose fixed codes only.
  }
  private async load() {
    const key = this.config.get("OPENROUTER_API_KEY", { infer: true });
    const [keyBody, creditBody, modelBody] = await Promise.all([key ? this.read("/key", key) : null, key ? this.read("/credits", key) : null, this.read("/models")]);
    const errors: string[] = [];
    if (key && !keyBody) errors.push("KEY_UNAVAILABLE");
    if (key && !creditBody) errors.push("CREDITS_UNAVAILABLE");
    if (!modelBody) errors.push("MODEL_METADATA_UNAVAILABLE");
    return { checkedAt: new Date().toISOString(), status: !key ? "unconfigured" : !errors.length ? "available" : errors.length === 3 ? "unavailable" : "partial", key: keyMetadata(keyBody, !key ? "unconfigured" : keyBody ? "available" : "unavailable"), credits: creditMetadata(creditBody, !key ? "unconfigured" : creditBody ? "available" : "unavailable"), freeQuota: quotaMetadata(keyBody), model: modelMetadata(modelBody, this.config.get("OPENROUTER_MODEL", { infer: true }), modelBody !== null), errors };
  }
}
