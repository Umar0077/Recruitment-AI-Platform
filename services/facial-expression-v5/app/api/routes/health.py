"""Liveness and readiness health endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.schemas.api import LivenessResponse, ReadinessResponse

router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("/live", response_model=LivenessResponse, summary="Process liveness check")
async def health_live(request: Request) -> LivenessResponse:
    """Confirm the FastAPI process is alive without revealing sensitive details."""
    state = request.app.state.v5
    return LivenessResponse(
        status="alive",
        service=state.settings.service_name,
        service_version=state.settings.service_version,
        timestamp=datetime.now(timezone.utc),
    )


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    summary="Model readiness check",
    responses={503: {"model": ReadinessResponse}},
)
async def health_ready(request: Request) -> JSONResponse | ReadinessResponse:
    """Report genuine model artifact readiness; returns HTTP 503 when unavailable."""
    state = request.app.state.v5
    bundle = state.bundle
    is_ready = bool(state.inference_service and state.inference_service.is_ready and bundle is not None)
    payload = ReadinessResponse(
        ready=is_ready,
        status="ready" if is_ready else "not_ready",
        model_version=state.settings.model_version,
        device=bundle.device_label if bundle is not None else state.settings.v5_device,
        classes_count=len(bundle.class_order) if bundle is not None else 0,
        ensemble_members_loaded=len(bundle.members) if bundle is not None else 0,
        reason=None if is_ready else (state.load_error_summary or "Model artifacts are not loaded."),
        timestamp=datetime.now(timezone.utc),
    )
    if not is_ready:
        return JSONResponse(status_code=503, content=payload.model_dump(mode="json"))
    return payload
