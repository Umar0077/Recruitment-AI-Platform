export interface V5HealthReadyResponse {
  ready: boolean;
  status: "ready" | "not_ready";
  model_version: string;
  device: string;
  classes_count: number;
  ensemble_members_loaded: number;
  reason?: string | null;
  timestamp: string;
}

export interface V5HealthLiveResponse {
  status: "alive";
  service: string;
  service_version: string;
  timestamp: string;
}

export interface V5EnsembleMemberSummary {
  kind: string;
  model_name: string;
  weight: number;
  use_tta: boolean;
  input_size: number;
  loaded: boolean;
}

export interface V5HistoricalBenchmarkSummary {
  dataset: string;
  sample_count?: number | null;
  accuracy?: number | null;
  macro_f1?: number | null;
  weighted_f1?: number | null;
  is_independent_recruitment_camera_benchmark: boolean;
  note: string;
}

export interface V5ModelInfoResponse {
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
  members: V5EnsembleMemberSummary[];
  historical_benchmark?: V5HistoricalBenchmarkSummary | null;
  responsible_use_notice: string;
}

export interface V5FaceBBox {
  x: number;
  y: number;
  width: number;
  height: number;
  image_width: number;
  image_height: number;
  coordinate_space: "pixel_xywh_top_left";
}

export interface V5TopPrediction {
  label: string;
  confidence: number;
}

export interface V5FrameInferenceResponse {
  request_id: string;
  status: "OK" | "NO_FACE_DETECTED" | "MULTIPLE_FACES_DETECTED";
  model_version: string;
  face_detected: boolean;
  face_count: number;
  expression_label: string | null;
  confidence: number | null;
  probabilities: Record<string, number> | null;
  top_predictions: V5TopPrediction[] | null;
  face_bbox: V5FaceBBox | null;
  processing_ms: number;
  device: string;
  quality_warning: string | null;
  uncertain: boolean;
  responsible_use_notice: string;
  timestamp: string;
}

export interface V5MetricsResponse {
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

export interface ModelLabHealthResponse {
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

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}
