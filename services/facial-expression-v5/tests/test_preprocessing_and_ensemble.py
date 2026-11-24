"""Tests comparing preprocessing and ensemble outputs against the original V5 inference.py."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np
import pytest
import torch
from PIL import Image

from app.models.ensemble import FacialExpressionEnsembleRunner
from app.models.loader import load_v5_bundle
from app.models.preprocessing import (
    ImageValidationError,
    decode_and_validate_image,
    prepare_fer_face_image,
)
from tests.conftest import V5_MODEL_DIR, make_jpeg_bytes, make_png_bytes, make_synthetic_face_image


def _load_reference_ensemble_class():
    spec = importlib.util.spec_from_file_location("v5_reference_inference", V5_MODEL_DIR / "inference.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["v5_reference_inference"] = module
    spec.loader.exec_module(module)
    return module.FacialExpressionEnsemble


def test_preprocessing_tensor_shapes_and_image_validation() -> None:
    face = make_synthetic_face_image(180, 180)
    fer_ready = prepare_fer_face_image(face)
    assert fer_ready.size == (48, 48)
    assert fer_ready.mode == "RGB"
    # Grayscale conversion ensures R == G == B at every pixel
    arr = np.asarray(fer_ready)
    assert np.array_equal(arr[:, :, 0], arr[:, :, 1])
    assert np.array_equal(arr[:, :, 1], arr[:, :, 2])

    jpg_bytes = make_jpeg_bytes(face)
    decoded_jpg = decode_and_validate_image(jpg_bytes, max_upload_bytes=10_000_000, max_decoded_pixels=12_000_000)
    assert decoded_jpg.mode == "RGB"
    assert decoded_jpg.size == (180, 180)

    png_bytes = make_png_bytes(face)
    decoded_png = decode_and_validate_image(png_bytes, max_upload_bytes=10_000_000, max_decoded_pixels=12_000_000)
    assert decoded_png.mode == "RGB"

    with pytest.raises(ImageValidationError) as empty_err:
        decode_and_validate_image(b"", max_upload_bytes=10_000_000, max_decoded_pixels=12_000_000)
    assert empty_err.value.code == "EMPTY_IMAGE"

    with pytest.raises(ImageValidationError) as corrupt_err:
        decode_and_validate_image(b"not-an-image", max_upload_bytes=10_000_000, max_decoded_pixels=12_000_000)
    assert corrupt_err.value.code == "INVALID_IMAGE"

    # Unsupported GIF format
    gif_buf = __import__("io").BytesIO()
    face.save(gif_buf, format="GIF")
    with pytest.raises(ImageValidationError) as gif_err:
        decode_and_validate_image(gif_buf.getvalue(), max_upload_bytes=10_000_000, max_decoded_pixels=12_000_000)
    assert gif_err.value.code == "UNSUPPORTED_MEDIA_TYPE"

    # Pixel limit exceeded
    with pytest.raises(ImageValidationError) as dim_err:
        decode_and_validate_image(png_bytes, max_upload_bytes=10_000_000, max_decoded_pixels=1000)
    assert dim_err.value.code == "IMAGE_DIMENSIONS_TOO_LARGE"


def test_ensemble_matches_original_reference_inference() -> None:
    bundle = load_v5_bundle(V5_MODEL_DIR, requested_device="cpu", warmup=False)
    runner = FacialExpressionEnsembleRunner(bundle)

    RefEnsemble = _load_reference_ensemble_class()
    ref = RefEnsemble(V5_MODEL_DIR, device="cpu")

    # Verify per-member transform tensor shape
    sample_face = make_synthetic_face_image(200, 200)
    fer_face = prepare_fer_face_image(sample_face)
    for member in bundle.members:
        tensor = member.transform(fer_face).unsqueeze(0)
        assert tuple(tensor.shape) == (1, 3, 224, 224)
        assert tensor.dtype == torch.float32

    our_pred = runner.predict_cropped_face(sample_face)
    ref_pred = ref.predict(sample_face)

    assert our_pred.expression_label == ref_pred["expression"]
    assert our_pred.confidence == pytest.approx(ref_pred["model_score"], abs=1e-6)
    for label, score in ref_pred["scores"].items():
        assert our_pred.probabilities[label] == pytest.approx(score, abs=1e-6)
    assert sum(our_pred.probabilities.values()) == pytest.approx(1.0, abs=1e-5)


def test_exif_orientation_and_face_detector_edge_cases() -> None:
    import cv2
    from app.vision.face_detector import DetectedBox, FaceDetector, _assess_face_quality, _deduplicate_boxes

    # EXIF orientation tag (6 = rotate 270 CW / 90 CCW -> 100x200 becomes 200x100)
    tall_img = Image.new("RGB", (100, 200), color=(40, 80, 120))
    exif = tall_img.getexif()
    exif[274] = 6  # Orientation tag
    buf = __import__("io").BytesIO()
    tall_img.save(buf, format="JPEG", exif=exif)
    decoded = decode_and_validate_image(buf.getvalue(), max_upload_bytes=10_000_000, max_decoded_pixels=12_000_000)
    assert decoded.size == (200, 100)

    # Deduplicating overlapping boxes keeps distinct faces and merges duplicates
    boxes = [
        DetectedBox(100, 100, 120, 120),
        DetectedBox(105, 104, 118, 118),  # duplicate overlap
        DetectedBox(320, 100, 110, 110),  # distinct second face
    ]
    deduped = _deduplicate_boxes(boxes)
    assert len(deduped) == 2

    # Dark + blurry quality warning
    dark_gray = np.full((240, 240), 20, dtype=np.uint8)
    warning = _assess_face_quality(dark_gray, DetectedBox(20, 20, 100, 100), 240, 240)
    assert warning is not None
    assert "LOW_LIGHT" in warning
    assert "BLURRY_FACE" in warning

    detector = FaceDetector(margin_ratio=0.18)
    blank_res = detector.detect_and_crop(Image.new("RGB", (320, 240), color=(10, 10, 10)))
    assert blank_res.status == "NO_FACE_DETECTED"
    assert blank_res.face_count == 0
    assert blank_res.cropped_face is None
