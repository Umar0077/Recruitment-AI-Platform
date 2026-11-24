"""Typed API response schemas for the Facial Expression V5 FastAPI service."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class LivenessResponse(BaseModel):
    status: Literal["alive"] = "alive"
    service: str
    service_version: str
    timestamp: datetime


class ReadinessResponse(BaseModel):
    ready: bool
    status: Literal["ready", "not_ready"]
    model_version: str
    device: str
    classes_count: int
    ensemble_members_loaded: int
    reason: str | None = None
    timestamp: datetime


class EnsembleMemberSummary(BaseModel):
    kind: str
    model_name: str
    weight: float
    use_tta: bool
    input_size: int
    loaded: bool


class HistoricalBenchmarkSummary(BaseModel):
    dataset: str
    sample_count: int | None = None
    accuracy: float | None = None
    macro_f1: float | None = None
    weighted_f1: float | None = None
    is_independent_recruitment_camera_benchmark: bool = False
    note: str


class ModelInfoResponse(BaseModel):
    model_name: str
    model_version: str
    service_version: str
    ready: bool
    labels: list[str]
    input_size: int
    channel_order: Literal["RGB"] = "RGB"
    preprocessing_summary: str
    device: str
    ensemble_available: bool
    calibrated: bool
    members: list[EnsembleMemberSummary]
    historical_benchmark: HistoricalBenchmarkSummary | None = None
    responsible_use_notice: str


class FaceBBox(BaseModel):
    x: int = Field(ge=0, description="Left pixel coordinate in EXIF-normalized image space")
    y: int = Field(ge=0, description="Top pixel coordinate in EXIF-normalized image space")
    width: int = Field(gt=0, description="Bounding box width in pixels")
    height: int = Field(gt=0, description="Bounding box height in pixels")
    image_width: int = Field(gt=0, description="Decoded EXIF-normalized image width in pixels")
    image_height: int = Field(gt=0, description="Decoded EXIF-normalized image height in pixels")
    coordinate_space: Literal["pixel_xywh_top_left"] = "pixel_xywh_top_left"


class TopPrediction(BaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)


class FrameInferenceResponse(BaseModel):
    request_id: str
    status: Literal["OK", "NO_FACE_DETECTED", "MULTIPLE_FACES_DETECTED"]
    model_version: str
    face_detected: bool
    face_count: int = Field(ge=0)
    expression_label: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    probabilities: dict[str, float] | None = None
    top_predictions: list[TopPrediction] | None = None
    face_bbox: FaceBBox | None = None
    processing_ms: float = Field(ge=0.0)
    device: str
    quality_warning: str | None = None
    uncertain: bool
    responsible_use_notice: str
    timestamp: datetime


class MetricsResponse(BaseModel):
    total_requests: int = Field(ge=0)
    successful_inferences: int = Field(ge=0)
    failed_requests: int = Field(ge=0)
    no_face_cases: int = Field(ge=0)
    multiple_face_cases: int = Field(ge=0)
    average_latency_ms: float | None = None
    p50_latency_ms: float | None = None
    p95_latency_ms: float | None = None
    sample_window_count: int = Field(ge=0)
    model_load_duration_ms: float | None = None
    ready: bool
    uptime_seconds: float = Field(ge=0.0)
    device: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any] | None = None
