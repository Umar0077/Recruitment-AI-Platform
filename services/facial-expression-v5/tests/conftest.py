"""Shared pytest fixtures for Facial Expression V5 tests."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from app.core.config import Settings, clear_settings_cache

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
V5_MODEL_DIR = REPO_ROOT / "_local_model_inputs" / "v5"


def make_jpeg_bytes(image: Image.Image, quality: int = 92) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def make_png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def make_blank_image(width: int = 320, height: int = 240, color: tuple[int, int, int] = (25, 35, 50)) -> Image.Image:
    return Image.new("RGB", (width, height), color=color)


def make_synthetic_face_image(width: int = 320, height: int = 320) -> Image.Image:
    """Create a local deterministic synthetic portrait-like fixture for unit tests."""
    img = Image.new("RGB", (width, height), color=(215, 220, 230))
    draw = ImageDraw.Draw(img)
    cx, cy = width // 2, height // 2
    r = min(width, height) // 3
    # Head oval
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(210, 175, 145), outline=(90, 65, 50), width=3)
    # Eyes + eyebrows
    eye_y = cy - r // 4
    eye_dx = r // 3
    draw.rectangle((cx - eye_dx - 18, eye_y - 24, cx - eye_dx + 18, eye_y - 16), fill=(45, 35, 30))
    draw.rectangle((cx + eye_dx - 18, eye_y - 24, cx + eye_dx + 18, eye_y - 16), fill=(45, 35, 30))
    draw.ellipse((cx - eye_dx - 14, eye_y - 8, cx - eye_dx + 14, eye_y + 8), fill=(245, 245, 245), outline=(40, 40, 40), width=2)
    draw.ellipse((cx + eye_dx - 14, eye_y - 8, cx + eye_dx + 14, eye_y + 8), fill=(245, 245, 245), outline=(40, 40, 40), width=2)
    draw.ellipse((cx - eye_dx - 6, eye_y - 6, cx - eye_dx + 6, eye_y + 6), fill=(30, 30, 35))
    draw.ellipse((cx + eye_dx - 6, eye_y - 6, cx + eye_dx + 6, eye_y + 6), fill=(30, 30, 35))
    # Nose bridge + shadow
    draw.polygon([(cx, cy - 8), (cx - 10, cy + 20), (cx + 10, cy + 20)], fill=(180, 140, 110))
    # Mouth
    draw.arc((cx - 28, cy + 26, cx + 28, cy + 56), start=10, end=170, fill=(130, 55, 55), width=4)
    return img


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    clear_settings_cache()
    yield
    clear_settings_cache()


@pytest.fixture
def test_settings() -> Settings:
    return Settings(
        v5_host="127.0.0.1",
        v5_port=8765,
        v5_model_dir=V5_MODEL_DIR,
        v5_device="cpu",
        v5_service_token="test-v5-secret-token-12345",
        v5_warmup_on_startup=False,
        v5_enable_tester=True,
    )
