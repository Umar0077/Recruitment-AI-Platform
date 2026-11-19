import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { EnvironmentVariables } from "../../src/config/env.validation";
import { usageTelemetry } from "../../src/modules/assessment/usage-telemetry";
import { UsageHistoryQuery, usageWindow } from "../../src/modules/assessment/api-usage.dto";
import { usageTotals } from "../../src/modules/assessment/api-usage.service";
import { creditMetadata, keyMetadata, modelMetadata, ProviderMetadataService, quotaMetadata } from "../../src/modules/assessment/provider-metadata.service";

describe("usage accounting and UTC windows", () => {
  const now = new Date("2026-03-01T00:30:00Z");
  it("uses UTC inclusive calendar dates across month, leap year and timezone boundaries", () => {
    expect(usageWindow("7d", now).from.toISOString()).toBe("2026-02-23T00:00:00.000Z");
    expect(usageWindow("month", now).from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(usageWindow("today", now, "2024-02-29", "2024-02-29").to.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(usageWindow("today", new Date("2026-02-28T20:00:00-05:00")).from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
  it.each([["2026-02-29", "2026-03-01"], ["2026-03-01", "2026-02-28"], ["2024-01-01", "2025-01-01"], ["2026-02-28", undefined]])("rejects invalid or oversized date ranges", (from, to) => {
    expect(() => usageWindow("30d", now, from, to)).toThrow();
  });
  it("bounds pagination and status filters", async () => {
    expect((await validate(plainToInstance(UsageHistoryQuery, { limit: 101, page: 0, status: "anything", model: "x".repeat(201) }))).length).toBe(4);
    expect(await validate(plainToInstance(UsageHistoryQuery, { limit: "100", page: "2", status: "failed" }))).toEqual([]);
  });
  it("keeps missing cost/token accounting unknown and distinguishes real zero cost", () => {
    expect(usageTotals()).toMatchObject({ requests: 0, costUsd: null, inputTokens: null, outputTokens: null, totalTokens: 0, costCoverageRequests: 0 });
    expect(usageTotals({ costUsd: 0, costCoverageRequests: 1 })).toMatchObject({ costUsd: 0, costCoverageRequests: 1 });
    expect(usageTelemetry({ id: "gen-123", usage: { prompt_tokens: 5, completion_tokens: 7, cost: 0 }, choices: [{ content: "private" }] })).toEqual({ inputTokens: 5, outputTokens: 7, tokens: 12, costUsd: 0, providerRequestId: "gen-123" });
    expect(usageTelemetry({ id: "unsafe secret\n", usage: { prompt_tokens: -1, completion_tokens: 1.1, total_tokens: Infinity, cost: "0.2" } })).toEqual({ inputTokens: null, outputTokens: null, tokens: 0, costUsd: null, providerRequestId: null });
  });
});

describe("safe provider metadata", () => {
  const originalFetch = global.fetch;
  const config = new ConfigService<EnvironmentVariables, true>({ ...new EnvironmentVariables(), OPENROUTER_API_KEY: "fictional-secret" });
  afterEach(() => { global.fetch = originalFetch; });
  it("returns exact quota only when supplied, without assuming key expiry is a reset", () => {
    const body = { data: { label: "secret-label", is_free_tier: true, expires_at: "2026-12-01T00:00:00Z", effective_budget: { resets_at: "2026-11-18T00:00:00Z" } } };
    expect(quotaMetadata(body)).toMatchObject({ limit: null, used: null, remaining: null, source: "unavailable", resetAt: null, resetSource: "unavailable" });
    expect(keyMetadata(body, "available")).toMatchObject({ expiresAt: "2026-12-01T00:00:00.000Z", budgetResetAt: "2026-11-18T00:00:00.000Z" });
    expect(JSON.stringify(keyMetadata(body, "available"))).not.toContain("secret-label");
    expect(quotaMetadata({ data: { free_model_daily_requests: { limit: 1000, used: 90, remaining: 910 } } })).toMatchObject({ source: "provider", limit: 1000, remaining: 910, resetAt: null });
  });
  it("uses catalog prices, preserving zero, rather than guessing from a model suffix", () => {
    expect(modelMetadata({ data: [{ id: "fictional:free", name: "Fictional", pricing: { prompt: "0.000002", completion: "0.000004", request: "0" }, context_length: 32000 }] }, "fictional:free", true)).toMatchObject({ availability: "available", pricingCategory: "paid", inputCostPerMillion: 2, outputCostPerMillion: 4, contextWindow: 32000 });
    expect(modelMetadata({ data: [{ id: "fictional", pricing: { prompt: "0", completion: "0", request: "0" } }] }, "fictional", true)).toMatchObject({ pricingCategory: "free", inputCostPerMillion: 0 });
    expect(modelMetadata({ data: [{ id: "fictional", pricing: { prompt: "0", completion: "0" } }] }, "fictional", true)).toMatchObject({ pricingCategory: "free", requestCostUsd: null });
    expect(modelMetadata({ data: [] }, "missing", true).availability).toBe("unavailable");
    expect(modelMetadata(null, "missing", false).availability).toBe("unknown");
    expect(creditMetadata({ data: { total_credits: 10, total_usage: 4.25 } }, "available").remainingUsd).toBe(5.75);
  });
  it("caches and deduplicates parallel safe GET metadata reads without leaking credentials or provider bodies", async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(url.endsWith("/models") ? { data: [] } : { data: { usage: 0, label: "fictional-secret", secret: "must-not-escape", total_credits: 10, total_usage: 0 } })));
    const service = new ProviderMetadataService(config);
    const [a, b] = await Promise.all([service.get(), service.get()]);
    expect(a).toEqual(b); expect(await service.get()).toEqual(a); expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(a)).not.toMatch(/fictional-secret|must-not-escape/);
    for (const [url, options] of (global.fetch as jest.Mock).mock.calls) { expect(url).not.toContain("completions"); expect(options).toMatchObject({ method: "GET", redirect: "error" }); }
    const modelOptions = (global.fetch as jest.Mock).mock.calls.find(([url]) => url.endsWith("/models"))[1];
    expect(modelOptions.headers).toEqual({});
  });
  it("handles credits permission denial and offline endpoints without raw errors", async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => url.endsWith("/key") ? new Response(JSON.stringify({ data: { usage: 0 } })) : new Response("forbidden fictional-secret", { status: 403 }));
    const result = await new ProviderMetadataService(config).get();
    expect(result).toMatchObject({ status: "partial", key: { status: "available" }, credits: { status: "unavailable", remainingUsd: null }, model: { availability: "unknown" }, errors: ["CREDITS_UNAVAILABLE", "MODEL_METADATA_UNAVAILABLE"] });
    expect(JSON.stringify(result)).not.toContain("fictional-secret");
    global.fetch = jest.fn().mockRejectedValue(new Error("network fictional-secret"));
    expect(await new ProviderMetadataService(config).get()).toMatchObject({ status: "unavailable" });
  });
});
