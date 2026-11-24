# BaliTech InterviewOS — Facial Expression V5 Model Lab Integration

## 1. Architecture Overview

The **Facial Expression V5 — Model Lab** integrates the standalone PyTorch FastAPI inference service (`services/facial-expression-v5/`) into InterviewOS through a strict server-to-server bridge:

```text
Admin Browser (/admin/model-lab)
   │  HttpOnly Admin Session Cookie + X-Admin-Request: 1 + Origin check
   ▼
NestJS Backend (/api/v1/admin/model-lab/*)
   │  Authorization: Bearer <V5_SERVICE_TOKEN> (server-side only)
   ▼
FastAPI V5 Engine (http://127.0.0.1:8765/api/v1/*)
   │
   ▼
V5 PyTorch Ensemble (EfficientNetV2-S + ConvNeXt-Tiny + ResNet50-D)
```

### Key Isolation Guarantees
- **No frontend token exposure:** `V5_SERVICE_TOKEN` lives exclusively in `backend/.env` and `services/facial-expression-v5/.env`. It is never exposed to Next.js (`NEXT_PUBLIC_*`), HTML, browser storage, or API responses.
- **No recruitment pipeline coupling:** Model Lab is completely isolated from candidate scoring, assessments, AI evaluation, shortlisting, interview recordings, and PostgreSQL candidate/application tables.
- **No database persistence:** Neither uploaded images, webcam frames, nor predicted expression scores are stored in PostgreSQL or `localStorage`.

---

## 2. Files Created & Modified

### Backend (`backend/`)
- `src/modules/model-lab/model-lab.types.ts` — Typed V5 and Model Lab health/inference/metrics interfaces.
- `src/modules/model-lab/v5-inference.client.ts` — Server-to-server HTTP client (`fetch`, `FormData`, `AbortSignal.timeout`, concurrency guard, sanitized error normalization).
- `src/modules/model-lab/model-lab.service.ts` — Feature flag enforcement, JPEG/PNG magic-byte & dimension validation, health/info/metrics/inference orchestration.
- `src/modules/model-lab/model-lab.controller.ts` — `SuperAdminModelLabGuard` + `@Controller("admin/model-lab")` endpoints (`health`, `model-info`, `metrics`, `infer/frame`).
- `src/modules/model-lab/model-lab.module.ts` — NestJS module wiring.
- `src/app.module.ts` — Registered `ModelLabModule`.
- `src/common/errors.ts` — Added `MODEL_LAB_DISABLED`, `MODEL_SERVICE_UNAVAILABLE`, `MODEL_INFERENCE_TIMEOUT`, `INVALID_IMAGE_UPLOAD`, and `IMAGE_TOO_LARGE`.
- `src/config/env.validation.ts` — Validated `MODEL_LAB_ENABLED`, `V5_SERVICE_URL`, `V5_SERVICE_TOKEN`, `V5_REQUEST_TIMEOUT_MS`, `V5_MAX_UPLOAD_BYTES`, and `V5_MAX_CONCURRENT_REQUESTS`.
- `.env.example` — Added placeholder Model Lab configuration (no real secrets).
- `test/auth/model-lab.spec.ts` — Authorization, origin/CSRF, feature flag, error normalization, and proxy forwarding tests.

### Frontend (`frontend/`)
- `src/app/admin/(app)/model-lab/page.tsx` — Protected `/admin/model-lab` route inside `AdminShell`.
- `src/components/admin/model-lab-view.tsx` — Full Model Lab UI (status header, opt-in camera preview with bounding box overlay, live testing ~1–2 FPS without overlapping requests, photo upload test, probability bars for all model categories, diagnostics, and privacy notice).
- `src/lib/api/model-lab.ts` — Typed frontend client using `credentials: "include"` and `X-Admin-Request: 1`.
- `src/components/admin/nav.ts`, `shell.tsx`, `command-palette.tsx` — Added `Model Lab` navigation item visible only to `SUPER_ADMIN` (`users:manage`).
- `tests/auth/model-lab.test.jsx` — Navigation visibility, camera lifecycle/cleanup, offline state, and photo inference tests.

### Startup & Docs
- `scripts/start-interviewos-with-v5.ps1` — PowerShell 5.1 helper to verify/start the 4-service stack without duplicating running instances.
- `services/facial-expression-v5/app/models/preprocessing.py` — Broadened corrupt image decode catch so malformed PNG/JPEG payloads consistently return `422 INVALID_IMAGE`.

---

## 3. Backend Environment Variables

Configure in `backend/.env` (never commit `.env` or real tokens):

```env
MODEL_LAB_ENABLED=true
V5_SERVICE_URL=http://127.0.0.1:8765
V5_SERVICE_TOKEN=<must match services/facial-expression-v5/.env V5_SERVICE_TOKEN>
V5_REQUEST_TIMEOUT_MS=18000
V5_MAX_UPLOAD_BYTES=10000000
V5_MAX_CONCURRENT_REQUESTS=2
```

- When `MODEL_LAB_ENABLED=false`, `/api/v1/admin/model-lab/health` reports `status: "disabled"`, and inference/metadata routes return `503 MODEL_LAB_DISABLED`.
- When `V5_SERVICE_TOKEN` is omitted or FastAPI is stopped, the rest of InterviewOS starts and runs normally, while Model Lab reports `unconfigured` / `offline` (`503 MODEL_SERVICE_UNAVAILABLE` on inference).

---

## 4. Authorization & Security Controls

1. **Global `AuthGuard`:** Requires valid `interviewos_admin_session` cookie (rejects unauthenticated requests with `401`, rejects Firebase candidate tokens with `403`, and enforces `@RequirePermissions("users:manage")`).
2. **`SuperAdminModelLabGuard`:** Additionally requires `SUPER_ADMIN` role, `admin-password` provider, `X-Admin-Request: 1` header on all GET/POST requests, and verified `Origin` in `FRONTEND_ORIGINS`.
3. **Upload validation:** Enforces byte limit (`V5_MAX_UPLOAD_BYTES`), magic-byte verification (JPEG/PNG only), decoded pixel limit (`<= 12 MP`), and `1` file per multipart request.
4. **No secret or frame logging:** Request bodies, uploaded images, and `V5_SERVICE_TOKEN` are never written to logs.

---

## 5. Backend API Surface

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/v1/admin/model-lab/health` | Non-throwing bridge health & readiness summary | `SUPER_ADMIN` |
| `GET` | `/api/v1/admin/model-lab/model-info` | Proxies `/api/v1/model/info` (labels, architecture, historical benchmark note) | `SUPER_ADMIN` |
| `GET` | `/api/v1/admin/model-lab/metrics` | Proxies `/api/v1/metrics` (aggregate latency/counters only) | `SUPER_ADMIN` |
| `POST` | `/api/v1/admin/model-lab/infer/frame` | Validates multipart `file` (JPEG/PNG) and forwards to V5 `/api/v1/infer/frame` | `SUPER_ADMIN` |

---

## 6. Startup & Troubleshooting

### Windows PowerShell Startup
```powershell
.\scripts\start-interviewos-with-v5.ps1
```
Or check status only:
```powershell
.\scripts\start-interviewos-with-v5.ps1 -StatusOnly
```

### Common Failure Modes
- **`Offline` / `MODEL_SERVICE_UNAVAILABLE`:** Ensure `services/facial-expression-v5` is running (`.\services\facial-expression-v5\scripts\start-v5.ps1`) and reachable at `V5_SERVICE_URL`.
- **Auth mismatch (`Backend-to-model service authentication failed`):** Ensure `V5_SERVICE_TOKEN` in `backend/.env` matches `services/facial-expression-v5/.env`, then restart NestJS.
- **Note on running dev servers:** If NestJS (`dist/main`) or Next.js was already running before edits, rebuild/restart those processes so the new `ModelLabModule` and `/admin/model-lab` route are served.
