"""Tests for configuration loading, validation, and V5 checkpoint loading."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
import torch
from pydantic import ValidationError

from app.core.config import Settings
from app.models.loader import ModelLoadError, load_v5_bundle
from tests.conftest import V5_MODEL_DIR

EXPECTED_CLASS_ORDER = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]


def test_settings_defaults_and_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("V5_PORT", "8766")
    monkeypatch.setenv("V5_DEVICE", "auto")
    monkeypatch.setenv("V5_SERVICE_TOKEN", "env-token-abc")
    cfg = Settings(_env_file=None)
    assert cfg.v5_host == "127.0.0.1"
    assert cfg.v5_port == 8766
    assert cfg.v5_device == "auto"
    assert cfg.v5_service_token == "env-token-abc"
    assert cfg.is_loopback_host is True


def test_invalid_configuration_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, v5_port=80)  # below 1024
    with pytest.raises(ValidationError):
        Settings(_env_file=None, v5_device="tpu")  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        Settings(_env_file=None, v5_log_level="VERBOSE")


def test_missing_model_directory_fails_cleanly(tmp_path: Path) -> None:
    missing_dir = tmp_path / "does-not-exist"
    with pytest.raises(ModelLoadError, match="Model directory does not exist"):
        load_v5_bundle(missing_dir, requested_device="cpu", warmup=False)


def test_missing_checkpoint_file_fails_cleanly(tmp_path: Path) -> None:
    settings_src = V5_MODEL_DIR / "selected_validation_settings.json"
    shutil.copy2(settings_src, tmp_path / "selected_validation_settings.json")
    with pytest.raises(ModelLoadError, match="Missing required checkpoint file"):
        load_v5_bundle(tmp_path, requested_device="cpu", warmup=False)


def test_invalid_settings_json_fails_cleanly(tmp_path: Path) -> None:
    (tmp_path / "selected_validation_settings.json").write_text("{not-json", encoding="utf-8")
    with pytest.raises(ModelLoadError, match="Failed to parse"):
        load_v5_bundle(tmp_path, requested_device="cpu", warmup=False)


def test_real_v5_checkpoints_load_and_match_metadata() -> None:
    bundle = load_v5_bundle(V5_MODEL_DIR, requested_device="cpu", warmup=True)
    assert bundle.class_order == EXPECTED_CLASS_ORDER
    assert bundle.image_size == 224
    assert bundle.device == torch.device("cpu")
    assert len(bundle.members) == 3

    by_filename = {m.filename: m for m in bundle.members}
    assert set(by_filename.keys()) == {"effnetv2_best.pt", "convnext_best.pt", "resnet_best.pt"}
    assert by_filename["effnetv2_best.pt"].model_name == "tf_efficientnetv2_s.in21k_ft_in1k"
    assert by_filename["effnetv2_best.pt"].weight == pytest.approx(0.4)
    assert by_filename["effnetv2_best.pt"].use_tta is True

    assert by_filename["convnext_best.pt"].model_name == "convnext_tiny.fb_in22k_ft_in1k"
    assert by_filename["convnext_best.pt"].weight == pytest.approx(0.2)
    assert by_filename["convnext_best.pt"].use_tta is False

    assert by_filename["resnet_best.pt"].model_name == "resnet50d.ra2_in1k"
    assert by_filename["resnet_best.pt"].weight == pytest.approx(0.4)
    assert by_filename["resnet_best.pt"].use_tta is True

    for member in bundle.members:
        assert member.model.training is False


def test_corrupted_class_order_detected(tmp_path: Path) -> None:
    settings_data = json.loads((V5_MODEL_DIR / "selected_validation_settings.json").read_text(encoding="utf-8"))
    settings_data["class_order"] = list(reversed(EXPECTED_CLASS_ORDER))
    (tmp_path / "selected_validation_settings.json").write_text(json.dumps(settings_data), encoding="utf-8")
    # Point to copied first checkpoint to verify mismatch detection without touching original weights
    shutil.copy2(V5_MODEL_DIR / "effnetv2_best.pt", tmp_path / "effnetv2_best.pt")
    with pytest.raises(ModelLoadError, match="Label order mismatch"):
        load_v5_bundle(tmp_path, requested_device="cpu", warmup=False)
