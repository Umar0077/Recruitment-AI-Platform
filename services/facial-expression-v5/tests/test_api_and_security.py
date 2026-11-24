"""End-to-end API, security, face detection, metrics, timeout, and shutdown tests."""

from __future__ import annotations

import asyncio
import re
import time
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageOps

from app.core.config import Settings
from app.main import create_app
from app.models.loader import load_v5_bundle
from app.vision.face_detector import DetectedBox, FaceDetectionResult
from tests.conftest import V5_MODEL_DIR, make_blank_image, make_jpeg_bytes, make_png_bytes, make_synthetic_face_image


@pytest.fixture(scope="module")
def shared_v5_bundle():
    return load_v5_bundle(V5_MODEL_DIR, requested_device="cpu", warmup=True)


def _auth_headers(token: str = "test-v5-secret-token-12345") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_health_endpoints_and_not_ready_separation(tmp_path: Path) -> None:
    broken_settings = Settings(
        _env_file=None,
        v5_model_dir=tmp_path / "missing",
        v5_service_token="token-123",
        v5_warmup_on_startup=False,
    )
    app = create_app(settings=broken_settings)
    with TestClient(app) as client:
        live = client.get("/api/v1/health/live")
        assert live.status_code == 200
        assert live.json()["status"] == "alive"

        ready = client.get("/api/v1/health/ready")
        assert ready.status_code == 503
        body = ready.json()
        assert body["ready"] is False
        assert body["status"] == "not_ready"
        assert "missing" not in (body.get("reason") or "").lower() or "directory" in body["reason"].lower()
        assert str(tmp_path) not in (body.get("reason") or "")

        # Inference rejects with 503 MODEL_NOT_READY
        blank_jpg = make_jpeg_bytes(make_blank_image())
        infer = client.post(
            "/api/v1/infer/frame",
            headers={"Authorization": "Bearer token-123"},
            files={"file": ("blank.jpg", blank_jpg, "image/jpeg")},
        )
        assert infer.status_code == 503
        assert infer.json()["detail"]["code"] == "MODEL_NOT_READY"


def test_authentication_failures_and_unconfigured_token(shared_v5_bundle) -> None:
    no_token_settings = Settings(
        _env_file=None,
        v5_model_dir=V5_MODEL_DIR,
        v5_service_token="",
    )
    app_no_tok = create_app(settings=no_token_settings, preloaded_bundle=shared_v5_bundle)
    with TestClient(app_no_tok) as client:
        r = client.get("/api/v1/model/info", headers=_auth_headers())
        assert r.status_code == 503
        assert r.json()["detail"]["code"] == "SERVICE_TOKEN_NOT_CONFIGURED"

    valid_settings = Settings(
        _env_file=None,
        v5_model_dir=V5_MODEL_DIR,
        v5_service_token="test-v5-secret-token-12345",
    )
    app = create_app(settings=valid_settings, preloaded_bundle=shared_v5_bundle)
    with TestClient(app) as client:
        assert client.get("/api/v1/model/info").status_code == 401
        assert client.get("/api/v1/model/info", headers=_auth_headers("wrong-token")).status_code == 401
        assert client.get("/api/v1/metrics").status_code == 401
        blank_jpg = make_jpeg_bytes(make_blank_image())
        assert (
            client.post(
                "/api/v1/infer/frame",
                files={"file": ("blank.jpg", blank_jpg, "image/jpeg")},
            ).status_code
            == 401
        )


def test_authorized_model_info_no_face_multiple_face_and_single_face_inference(
    test_settings: Settings, shared_v5_bundle
) -> None:
    app = create_app(settings=test_settings, preloaded_bundle=shared_v5_bundle)
    with TestClient(app) as client:
        # Ready
        ready = client.get("/api/v1/health/ready")
        assert ready.status_code == 200
        assert ready.json()["ready"] is True

        # Model info
        info = client.get("/api/v1/model/info", headers=_auth_headers())
        assert info.status_code == 200
        info_data = info.json()
        assert info_data["labels"] == ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
        assert info_data["ensemble_available"] is True
        assert len(info_data["members"]) == 3
        assert info_data["historical_benchmark"]["is_independent_recruitment_camera_benchmark"] is False

        # Empty / blank frame -> NO_FACE_DETECTED (never neutral!)
        blank_png = make_png_bytes(make_blank_image())
        no_face = client.post(
            "/api/v1/infer/frame",
            headers=_auth_headers(),
            files={"file": ("blank.png", blank_png, "image/png")},
        )
        assert no_face.status_code == 200
        nf_data = no_face.json()
        assert nf_data["status"] == "NO_FACE_DETECTED"
        assert nf_data["face_detected"] is False
        assert nf_data["face_count"] == 0
        assert nf_data["expression_label"] is None
        assert nf_data["confidence"] is None
        assert nf_data["probabilities"] is None

        # Corrupt / empty upload -> 422
        corrupt = client.post(
            "/api/v1/infer/frame",
            headers=_auth_headers(),
            files={"file": ("bad.jpg", b"corrupt-bytes", "image/jpeg")},
        )
        assert corrupt.status_code == 422

        empty = client.post(
            "/api/v1/infer/frame",
            headers=_auth_headers(),
            files={"file": ("empty.jpg", b"", "image/jpeg")},
        )
        assert empty.status_code == 422

        # Multiple faces -> MULTIPLE_FACES_DETECTED
        orig_detect = app.state.v5.face_detector.detect_and_crop
        app.state.v5.face_detector.detect_and_crop = lambda img: FaceDetectionResult(
            status="MULTIPLE_FACES_DETECTED",
            face_count=2,
            bbox=None,
            cropped_face=None,
            quality_warning=None,
        )
        multi = client.post(
            "/api/v1/infer/frame",
            headers=_auth_headers(),
            files={"file": ("two.jpg", make_jpeg_bytes(make_blank_image()), "image/jpeg")},
        )
        assert multi.status_code == 200
        m_data = multi.json()
        assert m_data["status"] == "MULTIPLE_FACES_DETECTED"
        assert m_data["face_detected"] is True
        assert m_data["face_count"] == 2
        assert m_data["expression_label"] is None

        # Single face -> real V5 ensemble inference
        face_img = make_synthetic_face_image(300, 300)
        app.state.v5.face_detector.detect_and_crop = lambda img: FaceDetectionResult(
            status="OK",
            face_count=1,
            bbox=DetectedBox(x=50, y=50, width=200, height=200),
            cropped_face=img.crop((30, 30, 270, 270)),
            quality_warning=None,
        )
        ok_resp = client.post(
            "/api/v1/infer/frame",
            headers=_auth_headers(),
            files={"file": ("face.jpg", make_jpeg_bytes(face_img), "image/jpeg")},
        )
        app.state.v5.face_detector.detect_and_crop = orig_detect
        assert ok_resp.status_code == 200
        ok_data = ok_resp.json()
        assert ok_data["status"] == "OK"
        assert ok_data["face_detected"] is True
        assert ok_data["face_count"] == 1
        assert ok_data["expression_label"] in info_data["labels"]
        assert 0.0 <= ok_data["confidence"] <= 1.0
        assert set(ok_data["probabilities"].keys()) == set(info_data["labels"])
        assert sum(ok_data["probabilities"].values()) == pytest.approx(1.0, abs=1e-4)
        assert len(ok_data["top_predictions"]) == 3
        assert ok_data["face_bbox"]["coordinate_space"] == "pixel_xywh_top_left"

        # Metrics reflect all requests above
        metrics = client.get("/api/v1/metrics", headers=_auth_headers())
        assert metrics.status_code == 200
        met = metrics.json()
        assert met["successful_inferences"] == 1
        assert met["no_face_cases"] == 1
        assert met["multiple_face_cases"] == 1
        assert met["failed_requests"] == 2
        assert met["total_requests"] == 5
        assert met["ready"] is True
        assert met["average_latency_ms"] > 0

    # Shutdown cleared runtime state
    assert app.state.v5.bundle is None
    assert app.state.v5.inference_service.is_ready is False


def test_oversized_upload_rejected(shared_v5_bundle) -> None:
    small_limit = Settings(
        _env_file=None,
        v5_model_dir=V5_MODEL_DIR,
        v5_service_token="test-v5-secret-token-12345",
        v5_max_upload_bytes=1024,
    )
    app = create_app(settings=small_limit, preloaded_bundle=shared_v5_bundle)
    with TestClient(app) as client:
        big_payload = b"x" * 2048
        resp = client.post(
            "/api/v1/infer/frame",
            headers=_auth_headers(),
            files={"file": ("big.jpg", big_payload, "image/jpeg")},
        )
        assert resp.status_code == 413
        assert resp.json()["detail"]["code"] == "PAYLOAD_TOO_LARGE"


def test_inference_timeout_returns_504(shared_v5_bundle) -> None:
    fast_timeout = Settings(
        _env_file=None,
        v5_model_dir=V5_MODEL_DIR,
        v5_service_token="test-v5-secret-token-12345",
        v5_inference_timeout_seconds=0.5,
    )
    app = create_app(settings=fast_timeout, preloaded_bundle=shared_v5_bundle)
    with TestClient(app) as client:
        def slow_pipeline(_bytes: bytes):
            time.sleep(0.8)
            raise AssertionError("Should have timed out")

        app.state.v5.inference_service._run_sync_pipeline = slow_pipeline  # type: ignore[method-assign]
        resp = client.post(
            "/api/v1/infer/frame",
            headers=_auth_headers(),
            files={"file": ("face.jpg", make_jpeg_bytes(make_blank_image()), "image/jpeg")},
        )
        assert resp.status_code == 504
        assert resp.json()["detail"]["code"] == "INFERENCE_TIMEOUT"


def test_tester_csrf_session_and_no_service_token_exposure(
    test_settings: Settings, shared_v5_bundle
) -> None:
    app = create_app(settings=test_settings, preloaded_bundle=shared_v5_bundle)
    with TestClient(app) as client:
        page = client.get("/tester")
        assert page.status_code == 200
        assert "test-v5-secret-token-12345" not in page.text
        match = re.search(r'<meta name="v5-csrf-token" content="([^"]+)"', page.text)
        assert match is not None
        csrf = match.group(1)

        # Missing CSRF header fails
        assert client.get("/tester/api/status").status_code == 401
        # Valid session cookie + CSRF header succeeds
        status_resp = client.get("/tester/api/status", headers={"X-V5-CSRF-Token": csrf})
        assert status_resp.status_code == 200
        assert status_resp.json()["ready"] is True

        infer_resp = client.post(
            "/tester/api/infer",
            headers={"X-V5-CSRF-Token": csrf},
            files={"file": ("blank.png", make_png_bytes(make_blank_image()), "image/png")},
        )
        assert infer_resp.status_code == 200
        assert infer_resp.json()["status"] == "NO_FACE_DETECTED"
