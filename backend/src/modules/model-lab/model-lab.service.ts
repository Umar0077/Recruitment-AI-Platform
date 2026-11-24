import { HttpStatus, Injectable } from "@nestjs/common";
import { AppError } from "../../common/errors";
import type {
  ModelLabHealthResponse,
  UploadedImageFile,
  V5FrameInferenceResponse,
  V5MetricsResponse,
  V5ModelInfoResponse,
} from "./model-lab.types";
import { V5InferenceClient } from "./v5-inference.client";

const MAX_DECODED_PIXELS = 12_000_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function detectImageFormat(buffer: Buffer): "image/jpeg" | "image/png" | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "image/png";
  }
  return null;
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24 || buffer.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (offset + 4 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) break;
    // Start Of Frame markers carrying image dimensions
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && offset + 9 <= buffer.length) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    offset += 2 + segmentLength;
  }
  return null;
}

@Injectable()
export class ModelLabService {
  constructor(private readonly client: V5InferenceClient) {}

  private assertEnabled(): void {
    if (!this.client.isEnabled()) {
      throw new AppError(
        "MODEL_LAB_DISABLED",
        "The Facial Expression V5 Model Lab is disabled by server configuration.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async getHealth(): Promise<ModelLabHealthResponse> {
    const checkedAt = new Date().toISOString();
    const maxUploadBytes = this.client.getMaxUploadBytes();
    const requestTimeoutMs = this.client.getTimeoutMs();

    if (!this.client.isEnabled()) {
      return {
        enabled: false,
        configured: this.client.hasToken(),
        status: "disabled",
        ready: false,
        live: false,
        modelVersion: "v5",
        serviceVersion: null,
        device: null,
        classesCount: 0,
        ensembleMembersLoaded: 0,
        maxUploadBytes,
        requestTimeoutMs,
        reason: "Model Lab feature flag (MODEL_LAB_ENABLED) is disabled.",
        checkedAt,
      };
    }

    const configured = this.client.hasToken();
    const probe = await this.client.probeHealth();

    if (probe.offlineReason) {
      return {
        enabled: true,
        configured,
        status: "offline",
        ready: false,
        live: false,
        modelVersion: "v5",
        serviceVersion: null,
        device: null,
        classesCount: 0,
        ensembleMembersLoaded: 0,
        maxUploadBytes,
        requestTimeoutMs,
        reason: probe.offlineReason,
        checkedAt,
      };
    }

    if (!configured) {
      return {
        enabled: true,
        configured: false,
        status: "unconfigured",
        ready: false,
        live: Boolean(probe.live),
        modelVersion: probe.ready?.model_version ?? "v5",
        serviceVersion: probe.live?.service_version ?? null,
        device: probe.ready?.device ?? null,
        classesCount: probe.ready?.classes_count ?? 0,
        ensembleMembersLoaded: probe.ready?.ensemble_members_loaded ?? 0,
        maxUploadBytes,
        requestTimeoutMs,
        reason: "V5_SERVICE_TOKEN is not configured on the backend.",
        checkedAt,
      };
    }

    const ready = Boolean(probe.ready?.ready);
    return {
      enabled: true,
      configured: true,
      status: ready ? "ready" : "not_ready",
      ready,
      live: Boolean(probe.live),
      modelVersion: probe.ready?.model_version ?? "v5",
      serviceVersion: probe.live?.service_version ?? null,
      device: probe.ready?.device ?? null,
      classesCount: probe.ready?.classes_count ?? 0,
      ensembleMembersLoaded: probe.ready?.ensemble_members_loaded ?? 0,
      maxUploadBytes,
      requestTimeoutMs,
      reason: ready ? null : (probe.ready?.reason ?? "Model checkpoints are not ready."),
      checkedAt,
    };
  }

  async getModelInfo(): Promise<V5ModelInfoResponse> {
    this.assertEnabled();
    return this.client.getModelInfo();
  }

  async getMetrics(): Promise<V5MetricsResponse> {
    this.assertEnabled();
    return this.client.getMetrics();
  }

  async inferFrame(file: UploadedImageFile | undefined): Promise<V5FrameInferenceResponse> {
    this.assertEnabled();
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new AppError(
        "INVALID_IMAGE_UPLOAD",
        "Attach a non-empty JPEG or PNG image in the 'file' field.",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const maxBytes = this.client.getMaxUploadBytes();
    if (file.buffer.length > maxBytes) {
      throw new AppError(
        "IMAGE_TOO_LARGE",
        `Image exceeds maximum allowed upload size of ${maxBytes} bytes.`,
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const detectedMime = detectImageFormat(file.buffer);
    if (!detectedMime) {
      throw new AppError(
        "INVALID_IMAGE_UPLOAD",
        "Unsupported or invalid image payload. Only valid JPEG and PNG images are accepted.",
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }

    const dims = detectedMime === "image/png" ? readPngDimensions(file.buffer) : readJpegDimensions(file.buffer);
    if (dims && (dims.width <= 0 || dims.height <= 0 || dims.width * dims.height > MAX_DECODED_PIXELS)) {
      throw new AppError(
        "INVALID_IMAGE_UPLOAD",
        `Image dimensions exceed the maximum allowed ${MAX_DECODED_PIXELS} pixels.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return this.client.inferFrame(file.buffer, detectedMime, file.originalname || "frame.jpg");
  }
}
