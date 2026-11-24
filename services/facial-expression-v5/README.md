# Facial Expression V5 Standalone FastAPI Engine

Standalone local Python 3.12 PyTorch + FastAPI inference service for the trained InterviewOS Facial Expression V5 ensemble (`_local_model_inputs/v5`).

## Quick Start (Windows 11 PowerShell)

```powershell
cd "services\facial-expression-v5"
.\scripts\setup-v5.ps1
.\scripts\start-v5.ps1
.\scripts\check-v5.ps1
```

Stop the background service:

```powershell
.\scripts\stop-v5.ps1
```

## Endpoints

- `GET /api/v1/health/live` — Process liveness
- `GET /api/v1/health/ready` — Model readiness (`200` when loaded, `503` otherwise)
- `GET /api/v1/model/info` — Safe model metadata (`Authorization: Bearer <V5_SERVICE_TOKEN>`)
- `POST /api/v1/infer/frame` — Frame inference on JPEG/PNG (`Authorization: Bearer <V5_SERVICE_TOKEN>`)
- `GET /api/v1/metrics` — Aggregate operational metrics (`Authorization: Bearer <V5_SERVICE_TOKEN>`)
- `GET /tester` — Loopback-only developer webcam and photo testing dashboard

## Documentation

- API contract for InterviewOS integration: [docs/V5_FASTAPI_CONTRACT.md](../../docs/V5_FASTAPI_CONTRACT.md)
- Service handoff and verified runtime report: [docs/V5_SERVICE_HANDOFF.md](../../docs/V5_SERVICE_HANDOFF.md)
