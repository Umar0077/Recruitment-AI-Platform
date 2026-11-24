import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppError } from "../../common/errors";
import type { EnvironmentVariables } from "../../config/env.validation";
import type {
  V5FrameInferenceResponse,
  V5HealthLiveResponse,
  V5HealthReadyResponse,
  V5MetricsResponse,
  V5ModelInfoResponse,
} from "./model-lab.types";

interface FastApiErrorBody {
  detail?: { code?: string; message?: string } | string;
}

/**
 * Server-to-server HTTP client for the standalone Facial Expression V5 FastAPI engine.
 * Keeps V5_SERVICE_TOKEN strictly server-side and normalizes all upstream errors.
 */
@Injectable()
export class V5InferenceClient {
  private readonly logger = new Logger(V5InferenceClient.name);
  private activeRequests = 0;

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  isEnabled(): boolean {
    return this.config.get("MODEL_LAB_ENABLED", { infer: true });
  }

  hasToken(): boolean {
    return this.config.get("V5_SERVICE_TOKEN", { infer: true }).trim().length > 0;
  }

  getMaxUploadBytes(): number {
    return this.config.get("V5_MAX_UPLOAD_BYTES", { infer: true });
  }

  getTimeoutMs(): number {
    return this.config.get("V5_REQUEST_TIMEOUT_MS", { infer: true });
  }

  private getBaseUrl(): string {
    return this.config.get("V5_SERVICE_URL", { infer: true }).replace(/\/+$/, "");
  }

  private getServiceTokenOrThrow(): string {
    const token = this.config.get("V5_SERVICE_TOKEN", { infer: true }).trim();
    if (!token) {
      throw new AppError(
        "MODEL_SERVICE_UNAVAILABLE",
        "Facial Expression V5 service credentials are not configured on the backend.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return token;
  }

  async probeHealth(): Promise<{
    live: V5HealthLiveResponse | null;
    ready: V5HealthReadyResponse | null;
    offlineReason: string | null;
  }> {
    const base = this.getBaseUrl();
    const timeoutMs = Math.min(this.getTimeoutMs(), 4000);

    try {
      const [liveRes, readyRes] = await Promise.all([
        fetch(`${base}/api/v1/health/live`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        }),
        fetch(`${base}/api/v1/health/ready`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        }),
      ]);

      const live = liveRes.ok ? ((await liveRes.json()) as V5HealthLiveResponse) : null;
      let ready: V5HealthReadyResponse | null = null;
      try {
        ready = (await readyRes.json()) as V5HealthReadyResponse;
      } catch {
        ready = null;
      }
      return { live, ready, offlineReason: null };
    } catch (err) {
      const isTimeout = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
      return {
        live: null,
        ready: null,
        offlineReason: isTimeout
          ? "Facial Expression V5 service health check timed out."
          : "Facial Expression V5 service is offline or unreachable.",
      };
    }
  }

  async getModelInfo(): Promise<V5ModelInfoResponse> {
    return this.requestJson<V5ModelInfoResponse>("/api/v1/model/info");
  }

  async getMetrics(): Promise<V5MetricsResponse> {
    return this.requestJson<V5MetricsResponse>("/api/v1/metrics");
  }

  async inferFrame(buffer: Buffer, mimetype: string, filename: string): Promise<V5FrameInferenceResponse> {
    const maxConcurrent = this.config.get("V5_MAX_CONCURRENT_REQUESTS", { infer: true });
    if (this.activeRequests >= maxConcurrent) {
      throw new AppError(
        "RATE_LIMITED",
        "Too many concurrent Model Lab inference requests. Please wait for the active frame to complete.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const token = this.getServiceTokenOrThrow();
    const form = new FormData();
    const safeName = filename.replace(/[^A-Za-z0-9._-]/g, "_") || "frame.jpg";
    const blob = new Blob([new Uint8Array(buffer)], { type: mimetype });
    form.append("file", blob, safeName);

    this.activeRequests += 1;
    try {
      const res = await this.performFetch("/api/v1/infer/frame", {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });
      return (await this.parseResponse<V5FrameInferenceResponse>(res)) as V5FrameInferenceResponse;
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
    }
  }

  private async requestJson<T>(path: string): Promise<T> {
    const token = this.getServiceTokenOrThrow();
    const res = await this.performFetch(path, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    return (await this.parseResponse<T>(res)) as T;
  }

  private async performFetch(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.getBaseUrl()}${path}`;
    const timeoutMs = this.getTimeoutMs();
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const isTimeout = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
      this.logger.warn({ event: isTimeout ? "v5_timeout" : "v5_unreachable", path });
      if (isTimeout) {
        throw new AppError(
          "MODEL_INFERENCE_TIMEOUT",
          "Facial Expression V5 service timed out while processing the request.",
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      throw new AppError(
        "MODEL_SERVICE_UNAVAILABLE",
        "Facial Expression V5 service is offline or unreachable.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async parseResponse<T>(res: Response): Promise<T> {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (res.ok) {
      return body as T;
    }

    const errDetail = (body as FastApiErrorBody | null)?.detail;
    const upstreamCode = typeof errDetail === "object" && errDetail?.code ? errDetail.code : undefined;
    const upstreamMsg =
      typeof errDetail === "object" && errDetail?.message
        ? errDetail.message
        : typeof errDetail === "string"
          ? errDetail
          : undefined;

    this.logger.warn({ event: "v5_upstream_error", status: res.status, code: upstreamCode });

    if (res.status === 401 || upstreamCode === "SERVICE_TOKEN_NOT_CONFIGURED") {
      throw new AppError(
        "MODEL_SERVICE_UNAVAILABLE",
        "Backend-to-model service authentication failed. Verify V5_SERVICE_TOKEN matches the FastAPI engine.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (res.status === 503 || upstreamCode === "MODEL_NOT_READY") {
      throw new AppError(
        "MODEL_SERVICE_UNAVAILABLE",
        upstreamMsg ?? "Facial Expression V5 model artifacts are not ready.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (res.status === 504 || upstreamCode === "INFERENCE_TIMEOUT") {
      throw new AppError(
        "MODEL_INFERENCE_TIMEOUT",
        upstreamMsg ?? "Facial Expression V5 inference exceeded the allowed timeout.",
        HttpStatus.GATEWAY_TIMEOUT,
      );
    }
    if (res.status === 413 || upstreamCode === "PAYLOAD_TOO_LARGE") {
      throw new AppError(
        "IMAGE_TOO_LARGE",
        upstreamMsg ?? "Uploaded image exceeds the maximum allowed byte size.",
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    if (res.status === 415 || res.status === 422 || res.status === 400) {
      throw new AppError(
        "INVALID_IMAGE_UPLOAD",
        upstreamMsg ?? "Uploaded image could not be processed as a valid JPEG or PNG.",
        res.status === 415 ? HttpStatus.UNSUPPORTED_MEDIA_TYPE : HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (res.status === 429) {
      throw new AppError(
        "RATE_LIMITED",
        "Facial Expression V5 rate limit reached. Slow down and retry.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    throw new AppError(
      "MODEL_SERVICE_UNAVAILABLE",
      "Facial Expression V5 service returned an unexpected error.",
      HttpStatus.BAD_GATEWAY,
    );
  }
}
