import { API_BASE_URL, isApiMode } from "@/lib/config/environment";
import { ApiError, apiRequest, onAuthFailure } from "./client";
import type { ApiEnvelope } from "./types";

export interface ModelLabHealth {
  enabled: boolean;
  configured: boolean;
  status: "ready" | "not_ready" | "offline" | "disabled" | "unconfigured";
  ready: boolean;
  live: boolean;
  modelVersion: string;
  serviceVersion: string | null;
  device: string | null;
  classesCount: number;
  ensembleMembersLoaded: number;
  maxUploadBytes: number;
  requestTimeoutMs: number;
  reason: string | null;
  checkedAt: string;
}

export interface ModelLabEnsembleMember {
  kind: string;
  model_name: string;
  weight: number;
  use_tta: boolean;
  input_size: number;
  loaded: boolean;
}

export interface ModelLabHistoricalBenchmark {
  dataset: string;
  sample_count?: number | null;
  accuracy?: number | null;
  macro_f1?: number | null;
  weighted_f1?: number | null;
  is_independent_recruitment_camera_benchmark: boolean;
  note: string;
}

export interface ModelLabModelInfo {
  model_name: string;
  model_version: string;
  service_version: string;
  ready: boolean;
  labels: string[];
  input_size: number;
  channel_order: "RGB";
  preprocessing_summary: string;
  device: string;
  ensemble_available: boolean;
  calibrated: boolean;
  members: ModelLabEnsembleMember[];
  historical_benchmark?: ModelLabHistoricalBenchmark | null;
  responsible_use_notice: string;
}

export interface ModelLabFaceBBox {
  x: number;
  y: number;
  width: number;
  height: number;
  image_width: number;
  image_height: number;
  coordinate_space: "pixel_xywh_top_left";
}

export interface ModelLabTopPrediction {
  label: string;
  confidence: number;
}

export interface ModelLabInferenceResult {
  request_id: string;
  status: "OK" | "NO_FACE_DETECTED" | "MULTIPLE_FACES_DETECTED";
  model_version: string;
  face_detected: boolean;
  face_count: number;
  expression_label: string | null;
  confidence: number | null;
  probabilities: Record<string, number> | null;
  top_predictions: ModelLabTopPrediction[] | null;
  face_bbox: ModelLabFaceBBox | null;
  processing_ms: number;
  device: string;
  quality_warning: string | null;
  uncertain: boolean;
  responsible_use_notice: string;
  timestamp: string;
}

export interface ModelLabMetrics {
  total_requests: number;
  successful_inferences: number;
  failed_requests: number;
  no_face_cases: number;
  multiple_face_cases: number;
  average_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  sample_window_count: number;
  model_load_duration_ms: number | null;
  ready: boolean;
  uptime_seconds: number;
  device: string;
}

// Re-export listener registration for auth-failure consumers if needed
export { onAuthFailure };

async function uploadAdminFrame(
  file: Blob,
  filename: string,
  signal?: AbortSignal,
  timeoutMs = 20_000,
): Promise<ModelLabInferenceResult> {
  if (!isApiMode) {
    throw new ApiError("API_DISABLED", "The app is running in demo mode; the backend API is not used.", 0);
  }

  const formData = new FormData();
  formData.append("file", file, filename);

  const timeout = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/admin/model-lab/infer/frame`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Admin-Request": "1",
      },
      body: formData,
      credentials: "include",
      cache: "no-store",
      signal: combinedSignal,
    });
  } catch (err) {
    const aborted = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    if (signal?.aborted) {
      throw new ApiError("REQUEST_ABORTED", "The inference request was cancelled.", 0);
    }
    throw new ApiError(
      aborted ? "TIMEOUT" : "NETWORK_ERROR",
      aborted ? "The Model Lab request took too long to respond." : "Could not reach the backend API.",
      0,
    );
  }

  let body: ApiEnvelope<ModelLabInferenceResult> | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<ModelLabInferenceResult>;
  } catch {
    body = null;
  }

  if (!body || typeof body !== "object" || !("success" in body)) {
    throw new ApiError("BAD_RESPONSE", `Unexpected response from the server (HTTP ${res.status}).`, res.status);
  }

  if (!body.success) {
    throw new ApiError(body.error.code, body.error.message, res.status, body.error.details, body.meta?.requestId);
  }

  return body.data;
}

export const modelLabApi = {
  health: async (signal?: AbortSignal) =>
    (await apiRequest<ModelLabHealth>("/admin/model-lab/health", { admin: true, notifyAuthFailure: false, signal })).data,
  modelInfo: async (signal?: AbortSignal) =>
    (await apiRequest<ModelLabModelInfo>("/admin/model-lab/model-info", { admin: true, notifyAuthFailure: false, signal })).data,
  metrics: async (signal?: AbortSignal) =>
    (await apiRequest<ModelLabMetrics>("/admin/model-lab/metrics", { admin: true, notifyAuthFailure: false, signal })).data,
  inferFrame: uploadAdminFrame,
};
