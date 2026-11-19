/** Only allowlisted scalar accounting values survive provider parsing. Never retain prompts/content. */
export function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 ? value : null;
}
export function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 10000000 ? value : null;
}
export function usageTelemetry(body: unknown) {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const usage = value.usage && typeof value.usage === "object" ? value.usage as Record<string, unknown> : {};
  const inputTokens = tokenCount(usage.prompt_tokens), outputTokens = tokenCount(usage.completion_tokens);
  const total = tokenCount(usage.total_tokens) ?? (inputTokens !== null && outputTokens !== null ? tokenCount(inputTokens + outputTokens) : null);
  return {
    inputTokens,
    outputTokens,
    tokens: total ?? 0,
    costUsd: money(usage.cost),
    providerRequestId: typeof value.id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value.id) ? value.id : null,
  };
}
