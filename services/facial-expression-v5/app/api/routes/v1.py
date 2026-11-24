"""Authenticated V5 inference, model info, and operational metrics routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status

from app.core.security import verify_bearer_token
from app.schemas.api import (
    EnsembleMemberSummary,
    ErrorDetail,
    FrameInferenceResponse,
    HistoricalBenchmarkSummary,
    MetricsResponse,
    ModelInfoResponse,
)
from app.services.inference_service import RESPONSIBLE_USE_NOTICE

router = APIRouter(
    prefix="/api/v1",
    tags=["v5-inference"],
    dependencies=[Depends(verify_bearer_token)],
)


def build_model_info_payload(request: Request) -> ModelInfoResponse:
    state = request.app.state.v5
    bundle = state.bundle
    if bundle is None:
        return ModelInfoResponse(
            model_name="Facial Expression V5 Ensemble",
            model_version=state.settings.model_version,
            service_version=state.settings.service_version,
            ready=False,
            labels=[],
            input_size=224,
            channel_order="RGB",
            preprocessing_summary="48x48 grayscale conversion -> RGB -> 224x224 resize -> per-member normalization",
            device=state.settings.v5_device,
            ensemble_available=False,
            calibrated=False,
            members=[],
            historical_benchmark=None,
            responsible_use_notice=RESPONSIBLE_USE_NOTICE,
        )

    historical = None
    if isinstance(bundle.historical_report, dict):
        test_metrics = bundle.historical_report.get("test_metrics", {})
        historical = HistoricalBenchmarkSummary(
            dataset=str(bundle.validation_settings.get("dataset", "FER2013 development split")),
            sample_count=bundle.historical_report.get("sample_count"),
            accuracy=test_metrics.get("accuracy"),
            macro_f1=test_metrics.get("macro_f1"),
            weighted_f1=test_metrics.get("weighted_f1"),
            is_independent_recruitment_camera_benchmark=bool(
                bundle.historical_report.get("is_independent_recruitment_camera_benchmark", False)
            ),
            note=str(
                bundle.historical_report.get(
                    "note",
                    "Historical offline development benchmark only; not live camera accuracy.",
                )
            ),
        )

    return ModelInfoResponse(
        model_name="Facial Expression V5 Ensemble",
        model_version=state.settings.model_version,
        service_version=state.settings.service_version,
        ready=True,
        labels=list(bundle.class_order),
        input_size=bundle.image_size,
        channel_order="RGB",
        preprocessing_summary=(
            "EXIF-normalized RGB -> face localization & square margin crop -> "
            "grayscale 48x48 bilinear -> RGB -> 224x224 resize -> per-member ImageNet normalization"
        ),
        device=bundle.device_label,
        ensemble_available=len(bundle.members) > 1,
        calibrated=bundle.calibrated,
        members=[
            EnsembleMemberSummary(
                kind=m.kind,
                model_name=m.model_name,
                weight=m.weight,
                use_tta=m.use_tta,
                input_size=m.input_size,
                loaded=True,
            )
            for m in bundle.members
        ],
        historical_benchmark=historical,
        responsible_use_notice=RESPONSIBLE_USE_NOTICE,
    )


@router.get("/model/info", response_model=ModelInfoResponse, summary="Safe V5 model metadata")
async def get_model_info(request: Request) -> ModelInfoResponse:
    """Return safe V5 architecture, class order, readiness, and historical benchmark metadata."""
    return build_model_info_payload(request)


@router.post(
    "/infer/frame",
    response_model=FrameInferenceResponse,
    summary="Analyze one JPEG/PNG frame for visual facial expression category",
    responses={
        401: {"model": ErrorDetail},
        413: {"model": ErrorDetail},
        415: {"model": ErrorDetail},
        422: {"model": ErrorDetail},
        429: {"model": ErrorDetail},
        503: {"model": ErrorDetail},
        504: {"model": ErrorDetail},
    },
)
async def infer_frame(
    request: Request,
    file: UploadFile = File(..., description="Single JPEG or PNG image frame"),
) -> FrameInferenceResponse:
    """Validate uploaded JPEG/PNG, detect face, and run V5 ensemble inference."""
    state = request.app.state.v5
    client_key = request.client.host if request.client else "local"
    state.rate_limiter.check(client_key)

    max_bytes = state.settings.v5_max_upload_bytes
    try:
        data = await file.read(max_bytes + 1)
    finally:
        await file.close()

    if len(data) > max_bytes:
        state.metrics.record_failure()
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={
                "code": "PAYLOAD_TOO_LARGE",
                "message": f"Image exceeds maximum allowed size of {max_bytes} bytes.",
            },
        )

    return await state.inference_service.infer_frame(data)


@router.get("/metrics", response_model=MetricsResponse, summary="Aggregate operational metrics")
async def get_metrics(request: Request) -> MetricsResponse:
    """Return bounded non-identifying operational counters and latency percentiles."""
    state = request.app.state.v5
    snap = state.metrics.snapshot()
    bundle = state.bundle
    return MetricsResponse(
        total_requests=snap.total_requests,
        successful_inferences=snap.successful_inferences,
        failed_requests=snap.failed_requests,
        no_face_cases=snap.no_face_cases,
        multiple_face_cases=snap.multiple_face_cases,
        average_latency_ms=snap.average_latency_ms,
        p50_latency_ms=snap.p50_latency_ms,
        p95_latency_ms=snap.p95_latency_ms,
        sample_window_count=snap.sample_window_count,
        model_load_duration_ms=bundle.load_duration_ms if bundle is not None else None,
        ready=bool(state.inference_service and state.inference_service.is_ready),
        uptime_seconds=snap.uptime_seconds,
        device=bundle.device_label if bundle is not None else state.settings.v5_device,
    )
