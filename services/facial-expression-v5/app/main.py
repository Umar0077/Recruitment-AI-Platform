"""FastAPI application entrypoint and lifecycle management for Facial Expression V5."""

from __future__ import annotations

import gc
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass

import torch
from fastapi import FastAPI, Request, Response

from app.api.routes import health, tester, v1
from app.core.config import Settings, get_settings
from app.core.security import InMemoryRateLimiter, TesterSessionManager
from app.metrics.collector import MetricsCollector
from app.models.loader import LoadedEnsembleBundle, ModelLoadError, load_v5_bundle
from app.services.inference_service import InferenceService
from app.vision.face_detector import FaceDetector

logger = logging.getLogger(__name__)


@dataclass
class AppRuntimeState:
    settings: Settings
    bundle: LoadedEnsembleBundle | None
    load_error_summary: str | None
    face_detector: FaceDetector
    metrics: MetricsCollector
    inference_service: InferenceService
    tester_sessions: TesterSessionManager
    rate_limiter: InMemoryRateLimiter


def _sanitize_load_error(err: Exception) -> str:
    if isinstance(err, ModelLoadError):
        msg = str(err)
        if "Missing required checkpoint file" in msg:
            return "Required V5 checkpoint file is missing."
        if "Missing required settings file" in msg:
            return "Required V5 settings file is missing."
        if "Model directory does not exist" in msg:
            return "Configured V5 model directory does not exist."
        return "V5 model artifacts failed validation."
    return "V5 model initialization failed."


def create_app(
    settings: Settings | None = None,
    *,
    preloaded_bundle: LoadedEnsembleBundle | None = None,
    skip_model_load: bool = False,
) -> FastAPI:
    """Create and configure the standalone V5 FastAPI application."""
    cfg = settings or get_settings()
    logging.basicConfig(
        level=getattr(logging, cfg.v5_log_level, logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        bundle = preloaded_bundle
        load_error_summary: str | None = None

        if bundle is None and not skip_model_load:
            try:
                bundle = load_v5_bundle(
                    model_dir=cfg.v5_model_dir,
                    requested_device=cfg.v5_device,
                    warmup=cfg.v5_warmup_on_startup,
                )
                logger.info(
                    "Loaded V5 ensemble (%d members) on %s in %.2f ms",
                    len(bundle.members),
                    bundle.device_label,
                    bundle.load_duration_ms,
                )
            except Exception as err:
                load_error_summary = _sanitize_load_error(err)
                logger.error("Failed to load V5 model bundle: %s", err)
                bundle = None
        elif skip_model_load and bundle is None:
            load_error_summary = "Model loading skipped."

        face_detector = FaceDetector(margin_ratio=cfg.v5_face_margin_ratio)
        metrics = MetricsCollector(window_size=cfg.v5_metrics_window_size)
        inference_service = InferenceService(
            settings=cfg,
            bundle=bundle,
            face_detector=face_detector,
            metrics=metrics,
        )
        application.state.v5 = AppRuntimeState(
            settings=cfg,
            bundle=bundle,
            load_error_summary=load_error_summary,
            face_detector=face_detector,
            metrics=metrics,
            inference_service=inference_service,
            tester_sessions=TesterSessionManager(),
            rate_limiter=InMemoryRateLimiter(max_per_minute=cfg.v5_rate_limit_per_minute),
        )
        try:
            yield
        finally:
            logger.info("Shutting down Facial Expression V5 service and releasing resources.")
            if hasattr(application.state, "v5"):
                application.state.v5.inference_service.runner = None
                application.state.v5.inference_service.bundle = None
                application.state.v5.bundle = None
            gc.collect()
            if torch.cuda.is_available():  # pragma: no cover - hardware dependent
                torch.cuda.empty_cache()

    application = FastAPI(
        title=cfg.service_name,
        version=cfg.service_version,
        description=(
            "Standalone PyTorch FastAPI inference engine for InterviewOS Facial Expression V5. "
            "Outputs predicted visual expression categories for a voluntary technical demo only."
        ),
        lifespan=lifespan,
    )

    @application.middleware("http")
    async def security_headers_middleware(request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response

    application.include_router(health.router)
    application.include_router(v1.router)
    if cfg.v5_enable_tester:
        application.include_router(tester.router)

    return application


app = create_app()
