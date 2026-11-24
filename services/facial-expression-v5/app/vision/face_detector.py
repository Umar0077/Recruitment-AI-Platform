"""OpenCV Haar-cascade face localization and quality checks."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Literal

import cv2
import numpy as np
from PIL import Image


@dataclass(frozen=True)
class DetectedBox:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class FaceDetectionResult:
    status: Literal["OK", "NO_FACE_DETECTED", "MULTIPLE_FACES_DETECTED"]
    face_count: int
    bbox: DetectedBox | None
    cropped_face: Image.Image | None
    quality_warning: str | None


def _box_iou_or_contained(a: DetectedBox, b: DetectedBox) -> bool:
    ax2, ay2 = a.x + a.width, a.y + a.height
    bx2, by2 = b.x + b.width, b.y + b.height
    ix1, iy1 = max(a.x, b.x), max(a.y, b.y)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return False
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = a.width * a.height
    area_b = b.width * b.height
    union = area_a + area_b - inter
    if union > 0 and (inter / union) >= 0.35:
        return True
    min_area = min(area_a, area_b)
    return min_area > 0 and (inter / min_area) >= 0.60


def _deduplicate_boxes(boxes: list[DetectedBox]) -> list[DetectedBox]:
    if len(boxes) <= 1:
        return boxes
    ordered = sorted(boxes, key=lambda b: b.width * b.height, reverse=True)
    kept: list[DetectedBox] = []
    for box in ordered:
        if any(_box_iou_or_contained(box, existing) for existing in kept):
            continue
        kept.append(box)
    return kept


def _assess_face_quality(
    gray_image: np.ndarray,
    box: DetectedBox,
    img_w: int,
    img_h: int,
) -> str | None:
    roi = gray_image[box.y : box.y + box.height, box.x : box.x + box.width]
    if roi.size == 0:
        return "PARTIAL_EDGE_FACE"
    warnings: list[str] = []
    mean_luma = float(np.mean(roi))
    contrast_std = float(np.std(roi))
    lap_var = float(cv2.Laplacian(roi, cv2.CV_64F).var())

    if mean_luma < 45.0:
        warnings.append("LOW_LIGHT")
    elif mean_luma > 225.0:
        warnings.append("OVEREXPOSED")
    if contrast_std < 18.0:
        warnings.append("LOW_CONTRAST")
    if lap_var < 35.0:
        warnings.append("BLURRY_FACE")

    edge_pad = 2
    if (
        box.x <= edge_pad
        or box.y <= edge_pad
        or (box.x + box.width) >= (img_w - edge_pad)
        or (box.y + box.height) >= (img_h - edge_pad)
    ):
        warnings.append("PARTIAL_EDGE_FACE")

    if not warnings:
        return None
    return ",".join(warnings)


def _crop_square_with_margin(image: Image.Image, box: DetectedBox, margin_ratio: float) -> Image.Image:
    img_w, img_h = image.size
    side = max(box.width, box.height)
    padded_side = max(int(round(side * (1.0 + 2.0 * margin_ratio))), 16)
    cx = box.x + box.width / 2.0
    cy = box.y + box.height / 2.0
    left = max(0, int(round(cx - padded_side / 2.0)))
    top = max(0, int(round(cy - padded_side / 2.0)))
    right = min(img_w, left + padded_side)
    bottom = min(img_h, top + padded_side)
    # Re-balance if clamped against right/bottom edges
    if right - left < padded_side and left > 0:
        left = max(0, right - padded_side)
    if bottom - top < padded_side and top > 0:
        top = max(0, bottom - padded_side)
    return image.crop((left, top, right, bottom))


class FaceDetector:
    """Thread-safe face localizer using bundled OpenCV Haar cascade classifiers."""

    def __init__(self, margin_ratio: float = 0.18) -> None:
        self._margin_ratio = margin_ratio
        self._lock = Lock()
        cascade_dir = Path(cv2.data.haarcascades)
        primary_path = cascade_dir / "haarcascade_frontalface_default.xml"
        fallback_path = cascade_dir / "haarcascade_frontalface_alt2.xml"
        self._primary = cv2.CascadeClassifier(str(primary_path))
        self._fallback = cv2.CascadeClassifier(str(fallback_path))
        if self._primary.empty():
            raise RuntimeError(f"Failed to load OpenCV primary Haar cascade: {primary_path}")
        if self._fallback.empty():
            raise RuntimeError(f"Failed to load OpenCV fallback Haar cascade: {fallback_path}")

    def detect_and_crop(self, rgb_image: Image.Image) -> FaceDetectionResult:
        """Detect face(s) in an EXIF-normalized RGB image and return crop or safe status."""
        img_w, img_h = rgb_image.size
        rgb_array = np.asarray(rgb_image, dtype=np.uint8)
        gray = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2GRAY)

        # Mild CLAHE improves detection stability in uneven/dim webcam lighting.
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        min_dim = min(img_w, img_h)
        min_face = max(32, min_dim // 16)

        with self._lock:
            raw_rects = self._primary.detectMultiScale(
                enhanced,
                scaleFactor=1.1,
                minNeighbors=6,
                minSize=(min_face, min_face),
            )
            if len(raw_rects) == 0:
                raw_rects = self._fallback.detectMultiScale(
                    enhanced,
                    scaleFactor=1.1,
                    minNeighbors=5,
                    minSize=(min_face, min_face),
                )

        boxes = [
            DetectedBox(x=int(x), y=int(y), width=int(w), height=int(h))
            for (x, y, w, h) in raw_rects
        ]
        boxes = _deduplicate_boxes(boxes)

        if len(boxes) == 0:
            return FaceDetectionResult(
                status="NO_FACE_DETECTED",
                face_count=0,
                bbox=None,
                cropped_face=None,
                quality_warning=None,
            )

        if len(boxes) > 1:
            return FaceDetectionResult(
                status="MULTIPLE_FACES_DETECTED",
                face_count=len(boxes),
                bbox=None,
                cropped_face=None,
                quality_warning=None,
            )

        box = boxes[0]
        quality_warning = _assess_face_quality(gray, box, img_w, img_h)
        cropped = _crop_square_with_margin(rgb_image, box, margin_ratio=self._margin_ratio)
        return FaceDetectionResult(
            status="OK",
            face_count=1,
            bbox=box,
            cropped_face=cropped,
            quality_warning=quality_warning,
        )
