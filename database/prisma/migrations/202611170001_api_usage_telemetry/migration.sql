-- Additive telemetry only. Historical split-token and cost values remain unknown (NULL).
ALTER TABLE "llm_request_usage"
  ADD COLUMN "input_tokens" INTEGER,
  ADD COLUMN "output_tokens" INTEGER,
  ADD COLUMN "cost_usd" DECIMAL(18,10),
  ADD COLUMN "provider_request_id" TEXT;

CREATE INDEX "llm_request_usage_model_created_at_idx" ON "llm_request_usage"("model", "created_at");
CREATE INDEX "llm_request_usage_status_created_at_idx" ON "llm_request_usage"("status", "created_at");
CREATE INDEX "llm_request_usage_purpose_created_at_idx" ON "llm_request_usage"("purpose", "created_at");
