# InterviewOS — Facial Expression V5 Service Handoff

## 1. Summary

A standalone, locally testable Python 3.12 + PyTorch + FastAPI inference service has been built in `services/facial-expression-v5/` for the pre-trained **Facial Expression V5** ensemble located at `_local_model_inputs/v5`.

Existing InterviewOS components (`frontend/`, `backend/`, `database/`, Prisma, auth) were left completely untouched, and all original model weights and reports under `_local_model_inputs/` remain unmodified (verified via SHA256).

---

## 2. Files Created

### Service (`services/facial-expression-v5/`)
- `app/__init__.py`
- `app/main.py` — FastAPI app factory, lifespan model loading/warmup, clean shutdown, security headers
- `app/core/__init__.py`, `app/core/config.py` — Typed `pydantic-settings` configuration (`Settings`)
- `app/core/security.py` — `hmac.compare_digest` Bearer auth, loopback checks, ephemeral HMAC+CSRF tester session manager, in-memory rate limiter
- `app/models/__init__.py`, `app/models/preprocessing.py` — Safe JPEG/PNG decode, EXIF transpose, pixel/byte caps, exact 48x48 grayscale-to-RGB FER transform
- `app/models/loader.py` — Safe `weights_only=True` checkpoint loader, strict metadata validation, CPU/CUDA selection, warmup
- `app/models/ensemble.py` — Exact 3-model weighted ensemble with horizontal-flip TTA and `class_bias` calibration
- `app/vision/__init__.py`, `app/vision/face_detector.py` — OpenCV Haar cascade face localization, overlapping-box deduplication, square margin crop, lighting/blur/edge quality warnings
- `app/metrics/__init__.py`, `app/metrics/collector.py` — Thread-safe bounded operational metrics & p50/p95 latency window
- `app/services/__init__.py`, `app/services/inference_service.py` — Concurrency semaphore, timeout enforcement, pipeline orchestration
- `app/schemas/__init__.py`, `app/schemas/api.py` — Typed Pydantic v2 request/response contracts
- `app/api/__init__.py`, `app/api/routes/__init__.py`
- `app/api/routes/health.py` — `GET /api/v1/health/live`, `GET /api/v1/health/ready`
- `app/api/routes/v1.py` — `GET /api/v1/model/info`, `POST /api/v1/infer/frame`, `GET /api/v1/metrics`
- `app/api/routes/tester.py` — Loopback-only `/tester`, `/tester/api/status`, `/tester/api/infer`
- `app/static/tester.html` — Local developer webcam & photo tester dashboard
- `scripts/setup-v5.ps1` — PowerShell 5.1 setup, `.venv` creation, local `.env` token generation, model verification
- `scripts/start-v5.ps1` — Background/foreground Uvicorn launcher with port check & readiness wait
- `scripts/check-v5.ps1` — Health, readiness, model info, and metrics verification
- `scripts/stop-v5.ps1` — Clean process stop via `tmp/v5-service.pid`
- `tests/conftest.py`, `tests/test_config_and_loader.py`, `tests/test_preprocessing_and_ensemble.py`, `tests/test_api_and_security.py`
- `.env.example`, `.gitignore`, `pytest.ini`, `requirements.txt`, `README.md`

### Documentation (`docs/`)
- `docs/V5_FASTAPI_CONTRACT.md`
- `docs/V5_SERVICE_HANDOFF.md`

---

## 3. Verified Model Package & Checkpoints

All checkpoints were verified directly from `_local_model_inputs/v5/` against `manifest.json` and `selected_validation_settings.json`:

- **Class Order (index 0..6):** `['angry', 'disgust', 'fear', 'happy', 'neutral', 'sad', 'surprise']`
- **Input Size:** `224 x 224` (`RGB`), preceded by `ImageOps.grayscale(...).resize((48, 48), BILINEAR).convert('RGB')`
- **Calibration:** `class_bias = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]` (`calibrated: false`)

| Member | `timm` Architecture | Checkpoint File | SHA256 | Weight | TTA (Flip) | Normalization Mean / Std |
|---|---|---|---|---:|---|---|
| `effnetv2` | `tf_efficientnetv2_s.in21k_ft_in1k` | `effnetv2_best.pt` | `482ccb90fe1a7818690b5d12f97abaeaffd3839e6606db8255df9b4928cd8450` | `0.4` | `true` | `[0.5, 0.5, 0.5]` / `[0.5, 0.5, 0.5]` |
| `convnext` | `convnext_tiny.fb_in22k_ft_in1k` | `convnext_best.pt` | `a886d8aa3c9006f00c72c93f9d0f685ba85f4f95d893978703a5050017e99581` | `0.2` | `false` | `[0.485, 0.456, 0.406]` / `[0.229, 0.224, 0.225]` |
| `resnet` | `resnet50d.ra2_in1k` | `resnet_best.pt` | `d4b56581f42e092f586bedff6586cdc106277f042723a8fe384bacbfabeff6e7` | `0.4` | `true` | `[0.485, 0.456, 0.406]` / `[0.229, 0.224, 0.225]` |

**Historical Offline Benchmark (`final_test_report.json`):**
- Split: FER2013 deduplicated test split (`n = 3572`)
- Accuracy: `70.63%` (`0.7063269876819709`), Macro F1: `0.6831`, Weighted F1: `0.7028`
- `is_independent_recruitment_camera_benchmark`: `false` — **not** live webcam accuracy.

---

## 4. Python Runtime & Tested Dependency Versions

- **OS:** Windows 11
- **Python:** `3.12.10` (isolated in `services/facial-expression-v5/.venv`)
- **Key tested packages (`pip freeze`):**
  - `torch==2.15.0` (CPU wheel, `cuda_avail=False` on this machine)
  - `torchvision==0.29.2`
  - `timm==1.0.31`
  - `opencv-python-headless==4.14.0.94`
  - `pillow==13.0.0`
  - `numpy==2.5.5`
  - `fastapi==0.165.0`
  - `starlette==1.10.0`
  - `uvicorn==0.54.0`
  - `pydantic==2.14.4`, `pydantic-settings==2.16.3`
  - `python-multipart==0.0.34`
  - `httpx==0.28.1`, `pytest==8.4.2`

Note: Starlette `1.10.0` removed `HTTP_413_PAYLOAD_TOO_LARGE` in favor of `HTTP_413_CONTENT_TOO_LARGE`; routes use `HTTP_413_CONTENT_TOO_LARGE`.

---

## 5. Observed CPU Performance & Test Results

- **Hardware verified:** CPU-only Windows 11 laptop (`nvidia-smi` not present, `torch.cuda.is_available() == False`)
- **Ensemble load + warmup time:** `2148.65 ms` (via `setup-v5.ps1`) / `2940.41 ms` (standalone benchmark run)
- **Ensemble inference latency (CPU, 5-run benchmark on 224x224 face):**
  - Individual runs: `780.98 ms`, `915.67 ms`, `755.56 ms`, `860.04 ms`, `791.78 ms`
  - Mean: **`820.81 ms`** per frame (~1.2 FPS max sustained on CPU)
- **Automated `pytest` results:** **16 / 16 passed** (`20.99s` total):
  - `tests/test_config_and_loader.py` (7 passed): defaults/env overrides, invalid config rejection, missing dir/checkpoint errors, invalid JSON, real V5 checkpoint loading & strict metadata check, label mismatch detection
  - `tests/test_preprocessing_and_ensemble.py` (3 passed): tensor shapes, image validation (empty, corrupt, unsupported GIF, dimension limit), numerical parity (`abs=1e-6`) with `_local_model_inputs/v5/inference.py`, EXIF orientation & Haar cascade edge cases
  - `tests/test_api_and_security.py` (6 passed): live/ready separation & 503 when not ready, Bearer auth & unconfigured token fail-closed checks, authorized `/model/info` & `/infer/frame` (`NO_FACE_DETECTED`, `MULTIPLE_FACES_DETECTED`, real `OK` ensemble inference, `/metrics`), oversized 413 rejection, 504 timeout handling, `/tester` CSRF + zero service-token exposure

---

## 6. Windows PowerShell Startup & Stop Commands

From `C:\Users\DEV-BT\Desktop\AI Recruitment Project\services\facial-expression-v5`:

```powershell
# 1. One-time setup (creates .venv, installs deps, generates local .env token, verifies V5 load)
.\scripts\setup-v5.ps1

# 2. Start background service on http://127.0.0.1:8765 (waits until /api/v1/health/ready returns true)
.\scripts\start-v5.ps1
# (Or run in foreground: .\scripts\start-v5.ps1 -Foreground)

# 3. Verify health, readiness, model info, and metrics
.\scripts\check-v5.ps1

# 4. Stop background service cleanly
.\scripts\stop-v5.ps1
```

If port `8765` is already occupied, update `V5_PORT=8766` in `services/facial-expression-v5/.env` and align the NestJS `FACIAL_EXPRESSION_V5_BASE_URL` env var accordingly.

---

## 7. Known Limitations & Notes for NestJS Integration Agent

1. **CPU latency (~820 ms/frame):** Because the V5 ensemble runs 5 forward passes at 224x224 per frame (EfficientNetV2-S + flip TTA, ConvNeXt-Tiny, ResNet50-D + flip TTA), live interview or demo sampling from the NestJS/frontend side should poll conservatively (e.g., 1 request every 1000–2000 ms, never overlapping in-flight requests) and use >= 18s HTTP timeouts.
2. **Face detection limitations:** Uses bundled OpenCV Haar cascades (`haarcascade_frontalface_default.xml` with `haarcascade_frontalface_alt2.xml` fallback) for zero-download offline reliability. Extreme side profiles, heavy occlusion, or very tightly pre-cropped 48x48 faces without background padding may return `NO_FACE_DETECTED`.
3. **Webcam live stream:** Physical hardware camera capture in `/tester` requires an attached webcam and user permission in Chrome on `http://127.0.0.1:8765/tester` (HTTPS is not required for `127.0.0.1` / `localhost` secure contexts).
4. **Bearer Token Sync:** `setup-v5.ps1` generates a random `V5_SERVICE_TOKEN` in `services/facial-expression-v5/.env`. Copy that token into the NestJS backend's private environment configuration only—never expose it to Next.js client code.
5. **Responsible Use:** Expose predictions only as an opt-in technical demo indicator with explicit disclaimer; never store per-candidate emotion timelines or feed predictions into scoring, ranking, or hiring workflows.
