# InterviewOS — Facial Expression V5 FastAPI Contract

This document defines the HTTP API contract between the **InterviewOS NestJS backend** (integration target) and the standalone **Facial Expression V5 FastAPI Engine**.

---

## 1. Service Base URL & Port

- **Default Base URL:** `http://127.0.0.1:8765`
- **Configured Host:** `127.0.0.1` (loopback only by default via `V5_HOST`)
- **Configured Port:** `8765` (configurable via `V5_PORT`; if `8765` is occupied, set `V5_PORT=8766` explicitly in `services/facial-expression-v5/.env` and update the NestJS backend environment variable to match)
- **OpenAPI Schema:** `GET http://127.0.0.1:8765/openapi.json` (Swagger UI at `/docs`)

---

## 2. Authentication & Security Headers

All inference, model metadata, and metrics routes require server-to-server Bearer token authentication:

```http
Authorization: Bearer <V5_SERVICE_TOKEN>
```

- **Fail-closed behavior:**
  - If `V5_SERVICE_TOKEN` is missing/empty on the FastAPI server, protected endpoints return `503 SERVICE_TOKEN_NOT_CONFIGURED`.
  - If the `Authorization` header is missing, malformed, or does not match `V5_SERVICE_TOKEN` (compared using `hmac.compare_digest`), protected endpoints return `401 UNAUTHORIZED`.
- **Browser / Frontend Boundary:**
  - Never expose `V5_SERVICE_TOKEN` in Next.js (`NEXT_PUBLIC_*`), browser JavaScript, HTML, or Git.
  - Browser clients must call the NestJS backend, which proxies authorized requests server-to-server to the V5 engine.
- **Health endpoints** (`/api/v1/health/live` and `/api/v1/health/ready`) are unauthenticated on loopback and return no secrets or filesystem paths.

---

## 3. Responsible-Use & Privacy Contract

- **Scope:** Outputs predicted visual facial-expression categories for a voluntary technical demo only.
- **Prohibited uses:** Predictions do not measure internal emotions, mental health, honesty, stress, intelligence, personality, or job suitability, and must never be used to evaluate, rank, shortlist, reject, or select job applicants.
- **Retention & Privacy:**
  - Uploaded frames are decoded and processed strictly in memory and discarded immediately after the response is returned.
  - No images, videos, face crops, or per-candidate emotion histories are persisted to disk or database.
  - Metrics track aggregate operational counters and bounded latency windows only.

---

## 4. Upload Limits & Timeouts

| Parameter | Default | Config Variable | Behavior When Exceeded |
|---|---|---|---|
| Max upload size | `10,000,000` bytes (~10 MB) | `V5_MAX_UPLOAD_BYTES` | `413 PAYLOAD_TOO_LARGE` |
| Max decoded pixels | `12,000,000` pixels (12 MP) | `V5_MAX_DECODED_PIXELS` | `422 IMAGE_DIMENSIONS_TOO_LARGE` |
| Allowed formats | `JPEG`, `PNG` | — | `415 UNSUPPORTED_MEDIA_TYPE` |
| Inference timeout | `15.0` seconds | `V5_INFERENCE_TIMEOUT_SECONDS` | `504 INFERENCE_TIMEOUT` |
| Concurrency limit | `2` concurrent inferences | `V5_MAX_CONCURRENT_INFERENCES` | Queued up to request timeout |
| Rate limit | `180` requests/min/client | `V5_RATE_LIMIT_PER_MINUTE` | `429 RATE_LIMIT_EXCEEDED` |

Recommended NestJS `HttpService` / `fetch` timeout calling `POST /api/v1/infer/frame`: **18,000 ms** (slightly above the 15,000 ms FastAPI inference timeout so structured `504` responses are received cleanly).

---

## 5. Endpoints

### 5.1 `GET /api/v1/health/live`

Basic process liveness check (no auth required).

**Response `200 OK`:**
```json
{
  "status": "alive",
  "service": "InterviewOS Facial Expression V5 Engine",
  "service_version": "1.0.0",
  "timestamp": "2026-11-24T17:59:20.123456Z"
}
```

### 5.2 `GET /api/v1/health/ready`

Reports genuine V5 checkpoint readiness (no auth required).

**Response `200 OK` (Ready):**
```json
{
  "ready": true,
  "status": "ready",
  "model_version": "v5",
  "device": "cpu",
  "classes_count": 7,
  "ensemble_members_loaded": 3,
  "reason": null,
  "timestamp": "2026-11-24T17:59:20.123456Z"
}
```

**Response `503 Service Unavailable` (Not Ready):**
```json
{
  "ready": false,
  "status": "not_ready",
  "model_version": "v5",
  "device": "cpu",
  "classes_count": 0,
  "ensemble_members_loaded": 0,
  "reason": "Required V5 checkpoint file is missing.",
  "timestamp": "2026-11-24T17:59:20.123456Z"
}
```

### 5.3 `GET /api/v1/model/info`

Requires `Authorization: Bearer <V5_SERVICE_TOKEN>`.

**Response `200 OK`:**
```json
{
  "model_name": "Facial Expression V5 Ensemble",
  "model_version": "v5",
  "service_version": "1.0.0",
  "ready": true,
  "labels": ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"],
  "input_size": 224,
  "channel_order": "RGB",
  "preprocessing_summary": "EXIF-normalized RGB -> face localization & square margin crop -> grayscale 48x48 bilinear -> RGB -> 224x224 resize -> per-member ImageNet normalization",
  "device": "cpu",
  "ensemble_available": true,
  "calibrated": false,
  "members": [
    {
      "kind": "effnetv2",
      "model_name": "tf_efficientnetv2_s.in21k_ft_in1k",
      "weight": 0.4,
      "use_tta": true,
      "input_size": 224,
      "loaded": true
    },
    {
      "kind": "convnext",
      "model_name": "convnext_tiny.fb_in22k_ft_in1k",
      "weight": 0.2,
      "use_tta": false,
      "input_size": 224,
      "loaded": true
    },
    {
      "kind": "resnet",
      "model_name": "resnet50d.ra2_in1k",
      "weight": 0.4,
      "use_tta": true,
      "input_size": 224,
      "loaded": true
    }
  ],
  "historical_benchmark": {
    "dataset": "FER2013 CSV; exact pixel duplicate filtering; PrivateTest not used for selection",
    "sample_count": 3572,
    "accuracy": 0.7063269876819709,
    "macro_f1": 0.683062295598127,
    "weighted_f1": 0.702776470656304,
    "is_independent_recruitment_camera_benchmark": false,
    "note": "FER2013 development benchmark, NOT live candidate-camera accuracy or actual emotion measurement."
  },
  "responsible_use_notice": "Predicted visual expression category for a voluntary technical demo only. Not a measurement of actual emotions, psychological state, honesty, or job suitability."
}
```

### 5.4 `POST /api/v1/infer/frame`

Requires `Authorization: Bearer <V5_SERVICE_TOKEN>`.

- **Content-Type:** `multipart/form-data`
- **Form field:** `file` — single JPEG or PNG image binary

**Response `200 OK` — Single Face Detected (`status: "OK"`):**
```json
{
  "request_id": "2c8d1b4e-8f91-4d4a-a1e2-6b5b7c8d9e0f",
  "status": "OK",
  "model_version": "v5",
  "face_detected": true,
  "face_count": 1,
  "expression_label": "happy",
  "confidence": 0.842153,
  "probabilities": {
    "angry": 0.012041,
    "disgust": 0.002114,
    "fear": 0.01532,
    "happy": 0.842153,
    "neutral": 0.089112,
    "sad": 0.021044,
    "surprise": 0.018216
  },
  "top_predictions": [
    { "label": "happy", "confidence": 0.842153 },
    { "label": "neutral", "confidence": 0.089112 },
    { "label": "sad", "confidence": 0.021044 }
  ],
  "face_bbox": {
    "x": 148,
    "y": 92,
    "width": 210,
    "height": 210,
    "image_width": 640,
    "image_height": 480,
    "coordinate_space": "pixel_xywh_top_left"
  },
  "processing_ms": 824.5,
  "device": "cpu",
  "quality_warning": null,
  "uncertain": false,
  "responsible_use_notice": "Predicted visual expression category for a voluntary technical demo only. Not a measurement of actual emotions, psychological state, honesty, or job suitability.",
  "timestamp": "2026-11-24T17:59:21.456789Z"
}
```

**Response `200 OK` — No Face Detected (`status: "NO_FACE_DETECTED"`):**
```json
{
  "request_id": "9f6b4b3d-2a19-40c5-9b31-1e2f3a4b5c6d",
  "status": "NO_FACE_DETECTED",
  "model_version": "v5",
  "face_detected": false,
  "face_count": 0,
  "expression_label": null,
  "confidence": null,
  "probabilities": null,
  "top_predictions": null,
  "face_bbox": null,
  "processing_ms": 11.4,
  "device": "cpu",
  "quality_warning": null,
  "uncertain": false,
  "responsible_use_notice": "Predicted visual expression category for a voluntary technical demo only. Not a measurement of actual emotions, psychological state, honesty, or job suitability.",
  "timestamp": "2026-11-24T17:59:22.102345Z"
}
```

**Response `200 OK` — Multiple Faces Detected (`status: "MULTIPLE_FACES_DETECTED"`):**
```json
{
  "request_id": "4e1c2a7b-0b23-411f-9a8d-7c6e5d4f3a2b",
  "status": "MULTIPLE_FACES_DETECTED",
  "model_version": "v5",
  "face_detected": true,
  "face_count": 2,
  "expression_label": null,
  "confidence": null,
  "probabilities": null,
  "top_predictions": null,
  "face_bbox": null,
  "processing_ms": 14.2,
  "device": "cpu",
  "quality_warning": "MULTIPLE_FACES_IN_FRAME",
  "uncertain": false,
  "responsible_use_notice": "Predicted visual expression category for a voluntary technical demo only. Not a measurement of actual emotions, psychological state, honesty, or job suitability.",
  "timestamp": "2026-11-24T17:59:23.019283Z"
}
```

### 5.5 `GET /api/v1/metrics`

Requires `Authorization: Bearer <V5_SERVICE_TOKEN>`.

**Response `200 OK`:**
```json
{
  "total_requests": 12,
  "successful_inferences": 8,
  "failed_requests": 1,
  "no_face_cases": 2,
  "multiple_face_cases": 1,
  "average_latency_ms": 620.14,
  "p50_latency_ms": 791.78,
  "p95_latency_ms": 910.4,
  "sample_window_count": 11,
  "model_load_duration_ms": 2148.65,
  "ready": true,
  "uptime_seconds": 142.8,
  "device": "cpu"
}
```

---

## 6. Error Codes

Error responses follow FastAPI's structured `detail` envelope:

```json
{
  "detail": {
    "code": "ERROR_CODE",
    "message": "Human-readable sanitized description."
  }
}
```

| HTTP Status | `detail.code` | Cause |
|---|---|---|
| `401` | `UNAUTHORIZED` | Missing, malformed, or invalid `Authorization: Bearer` token |
| `413` | `PAYLOAD_TOO_LARGE` | Uploaded file exceeds `V5_MAX_UPLOAD_BYTES` |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | Image format is not JPEG or PNG |
| `422` | `EMPTY_IMAGE` | Uploaded file has 0 bytes |
| `422` | `INVALID_IMAGE` | Corrupt or unreadable JPEG/PNG payload |
| `422` | `IMAGE_DIMENSIONS_TOO_LARGE` | Decoded image exceeds `V5_MAX_DECODED_PIXELS` |
| `429` | `RATE_LIMIT_EXCEEDED` | Client exceeded `V5_RATE_LIMIT_PER_MINUTE` |
| `500` | `INFERENCE_INTERNAL_ERROR` | Unexpected internal inference error (sanitized) |
| `503` | `SERVICE_TOKEN_NOT_CONFIGURED` | `V5_SERVICE_TOKEN` not set in service environment |
| `503` | `MODEL_NOT_READY` | V5 model checkpoints failed to load or are unavailable |
| `504` | `INFERENCE_TIMEOUT` | Pipeline exceeded `V5_INFERENCE_TIMEOUT_SECONDS` |

---

## 7. Recommended NestJS Backend Environment Variables

For the InterviewOS integration agent (separate task):

```env
FACIAL_EXPRESSION_V5_ENABLED=false
FACIAL_EXPRESSION_V5_BASE_URL=http://127.0.0.1:8765
FACIAL_EXPRESSION_V5_TOKEN=<same V5_SERVICE_TOKEN as services/facial-expression-v5/.env>
FACIAL_EXPRESSION_V5_TIMEOUT_MS=18000
```
