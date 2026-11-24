"""End-to-end frame inference orchestration with concurrency and timeout guards."""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.core.config import Settings
from app.metrics.collector import MetricsCollector
from app.models.ensemble import FacialExpressionEnsembleRunner
from app.models.loader import LoadedEnsembleBundle
from app.models.preprocessing import ImageValidationError, decode_and_validate_image
from app.schemas.api import FaceBBox, FrameInferenceResponse, TopPrediction
from app.vision.face_detector import FaceDetector

RESPONSIBLE_USE_NOTICE = (
    "Predicted visual expression category for a voluntary technical demo only. "
    "Not a measurement of actual emotions, psychological state, honesty, or job suitability."
)


class InferenceService:
    """Coordinates validation, face detection, V5 ensemble inference, and metrics."""

    def __init__(
        self,
        *,
        settings: Settings,
        bundle: LoadedEnsembleBundle | None,
        face_detector: FaceDetector,
        metrics: MetricsCollector,
    ) -> None:
        self.settings = settings
        self.bundle = bundle
        self.runner = FacialExpressionEnsembleRunner(bundle) if bundle is not None else None
        self.face_detector = face_detector
        self.metrics = metrics
        self._semaphore = asyncio.Semaphore(settings.v5_max_concurrent_inferences)

    @property
    def is_ready(self) -> bool:
        return self.bundle is not None and self.runner is not None

    def _run_sync_pipeline(self, image_bytes: bytes) -> tuple[str, FrameInferenceResponse]:
        started = time.perf_counter()
        request_id = str(uuid.uuid4())
        assert self.bundle is not None and self.runner is not None

        rgb_image = decode_and_validate_image(
            image_bytes,
            max_upload_bytes=self.settings.v5_max_upload_bytes,
            max_decoded_pixels=self.settings.v5_max_decoded_pixels,
        )
        img_w, img_h = rgb_image.size
        detection = self.face_detector.detect_and_crop(rgb_image)

        if detection.status == "NO_FACE_DETECTED":
            elapsed_ms = round((time.perf_counter() - started) * 1000.0, 2)
            response = FrameInferenceResponse(
                request_id=request_id,
                status="NO_FACE_DETECTED",
                model_version=self.settings.model_version,
                face_detected=False,
                face_count=0,
                expression_label=None,
                confidence=None,
                probabilities=None,
                top_predictions=None,
                face_bbox=None,
                processing_ms=elapsed_ms,
                device=self.bundle.device_label,
                quality_warning=None,
                uncertain=False,
                responsible_use_notice=RESPONSIBLE_USE_NOTICE,
                timestamp=datetime.now(timezone.utc),
            )
            return "NO_FACE_DETECTED", response

        if detection.status == "MULTIPLE_FACES_DETECTED":
            elapsed_ms = round((time.perf_counter() - started) * 1000.0, 2)
            response = FrameInferenceResponse(
                request_id=request_id,
                status="MULTIPLE_FACES_DETECTED",
                model_version=self.settings.model_version,
                face_detected=True,
                face_count=detection.face_count,
                expression_label=None,
                confidence=None,
                probabilities=None,
                top_predictions=None,
                face_bbox=None,
                processing_ms=elapsed_ms,
                device=self.bundle.device_label,
                quality_warning="MULTIPLE_FACES_IN_FRAME",
                uncertain=False,
                responsible_use_notice=RESPONSIBLE_USE_NOTICE,
                timestamp=datetime.now(timezone.utc),
            )
            return "MULTIPLE_FACES_DETECTED", response

        assert detection.bbox is not None and detection.cropped_face is not None
        prediction = self.runner.predict_cropped_face(detection.cropped_face)
        elapsed_ms = round((time.perf_counter() - started) * 1000.0, 2)
        uncertain = prediction.confidence < self.settings.v5_uncertain_threshold
        bbox = FaceBBox(
            x=detection.bbox.x,
            y=detection.bbox.y,
            width=detection.bbox.width,
            height=detection.bbox.height,
            image_width=img_w,
            image_height=img_h,
        )
        response = FrameInferenceResponse(
            request_id=request_id,
            status="OK",
            model_version=self.settings.model_version,
            face_detected=True,
            face_count=1,
            expression_label=prediction.expression_label,
            confidence=round(prediction.confidence, 6),
            probabilities={k: round(v, 6) for k, v in prediction.probabilities.items()},
            top_predictions=[
                TopPrediction(label=label, confidence=round(score, 6))
                for label, score in prediction.top_predictions
            ],
            face_bbox=bbox,
            processing_ms=elapsed_ms,
            device=self.bundle.device_label,
            quality_warning=detection.quality_warning,
            uncertain=uncertain,
            responsible_use_notice=RESPONSIBLE_USE_NOTICE,
            timestamp=datetime.now(timezone.utc),
        )
        return "OK", response

    async def infer_frame(self, image_bytes: bytes) -> FrameInferenceResponse:
        """Run bounded, timeout-protected inference on uploaded JPEG/PNG bytes."""
        if not self.is_ready:
            self.metrics.record_failure()
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "code": "MODEL_NOT_READY",
                    "message": "Facial Expression V5 model is not loaded.",
                },
            )

        try:
            async with self._semaphore:
                outcome, response = await asyncio.wait_for(
                    asyncio.to_thread(self._run_sync_pipeline, image_bytes),
                    timeout=self.settings.v5_inference_timeout_seconds,
                )
        except ImageValidationError as err:
            self.metrics.record_failure()
            raise HTTPException(
                status_code=err.status_code,
                detail={"code": err.code, "message": err.message},
            ) from err
        except TimeoutError as err:
            self.metrics.record_failure()
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail={
                    "code": "INFERENCE_TIMEOUT",
                    "message": "Frame inference exceeded configured timeout.",
                },
            ) from err
        except HTTPException:
            self.metrics.record_failure()
            raise
        except Exception as err:
            self.metrics.record_failure()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "code": "INFERENCE_INTERNAL_ERROR",
                    "message": "An unexpected error occurred during inference.",
                },
            ) from err

        if outcome == "OK":
            self.metrics.record_success(response.processing_ms)
        elif outcome == "NO_FACE_DETECTED":
            self.metrics.record_no_face(response.processing_ms)
        elif outcome == "MULTIPLE_FACES_DETECTED":
            self.metrics.record_multiple_faces(response.processing_ms)
        return response
