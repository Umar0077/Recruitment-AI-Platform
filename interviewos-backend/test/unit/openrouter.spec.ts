import { ConfigService } from "@nestjs/config";
import { EnvironmentVariables } from "../../src/config/env.validation";
import { OpenRouterService } from "../../src/modules/assessment/openrouter.service";
import { PrismaService } from "../../src/database/prisma.service";
describe("OpenRouter mocked HTTP", () => {
  const env = { ...new EnvironmentVariables(), OPENROUTER_API_KEY: "test-secret" };
  let provider: OpenRouterService;
  let update: jest.Mock;
  let count: jest.Mock;
  const originalFetch = global.fetch;
  const args = { system: "synthetic", input: "fictional", schema: { type: "object" }, synthetic: true, purpose: "test", validate: (v: unknown) => { if (!(v as { ok?: boolean }).ok) throw new Error("bad"); } };
  beforeEach(() => {
    update = jest.fn().mockResolvedValue({}); count = jest.fn().mockResolvedValue(0);
    const usage = { count, update, updateMany: jest.fn(), create: jest.fn().mockResolvedValue({ id: "request-123" }) };
    const db = { lLMRequestUsage: usage, $transaction: (fn: (tx: unknown) => unknown) => fn({ lLMRequestUsage: usage, $executeRaw: jest.fn() }) };
    provider = new OpenRouterService(db as unknown as PrismaService, new ConfigService(env));
  });
  afterEach(() => { global.fetch = originalFetch; });
  it("sends exact model, schema, no fallback and records tokens", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }], usage: { total_tokens: 22 } })));
    await expect(provider.request(args)).resolves.toEqual({ ok: true });
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(JSON.parse(call[1].body)).toMatchObject({ model: env.OPENROUTER_MODEL, provider: { allow_fallbacks: false }, response_format: { type: "json_schema" } });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED", tokens: 22 }) }));
  });
  it.each([[401, "PROVIDER_AUTH_FAILED"], [403, "PROVIDER_AUTH_FAILED"], [400, "PROVIDER_REQUEST_REJECTED"], [404, "PROVIDER_REQUEST_REJECTED"], [429, "RATE_LIMITED"], [503, "PROVIDER_UNAVAILABLE"]])("maps HTTP %i safely", async (status, code) => {
    global.fetch = jest.fn().mockResolvedValue(new Response("sensitive provider body test-secret", { status: status as number, headers: { "retry-after": "90" } }));
    await expect(provider.request(args)).rejects.toMatchObject({ code });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(update.mock.calls)).not.toContain("test-secret");
  });
  it.each(["", "not JSON", '{"choices":[]}', JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "invalid JSON" } }] }), JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] }), JSON.stringify({ choices: [{ finish_reason: "length", message: { content: '{"ok":true}' } }] })])("rejects malformed output %s", async body => {
    global.fetch = jest.fn().mockResolvedValue(new Response(body));
    await expect(provider.request(args)).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });
  it("maps timeout without leaking errors", async () => {
    global.fetch = jest.fn().mockRejectedValue(new DOMException("timeout with secret", "TimeoutError"));
    await expect(provider.request(args)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
  it("records a single attempt's token split and zero cost even when structured output fails validation", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ id: "gen-fictional", choices: [{ finish_reason: "stop", message: { content: "{}" } }], usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12, cost: 0 } })));
    await expect(provider.request({ ...args, attempt: 1 })).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    expect(global.fetch).toHaveBeenCalledTimes(1); expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ where: { id: "request-123" }, data: expect.objectContaining({ status: "INVALID_OUTPUT", inputTokens: 9, outputTokens: 3, tokens: 12, costUsd: 0, providerRequestId: "gen-fictional" }) });
  });
  it("reserves capacity before sending, and fails closed for real text", async () => {
    global.fetch = jest.fn(); count.mockResolvedValue(40);
    await expect(provider.request(args)).rejects.toMatchObject({ code: "WAITING_FOR_CAPACITY" });
    await expect(provider.request({ ...args, synthetic: false })).rejects.toMatchObject({ code: "WAITING_FOR_APPROVED_PROVIDER" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
