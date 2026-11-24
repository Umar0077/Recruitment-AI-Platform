"""Checkpoint loader and validator for the Facial Expression V5 ensemble."""

from __future__ import annotations

import json
import logging
import math
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import timm
import torch
from torchvision import transforms as T

from app.models.preprocessing import build_member_transform

logger = logging.getLogger(__name__)


@dataclass
class LoadedMember:
    kind: str
    model_name: str
    filename: str
    weight: float
    use_tta: bool
    input_size: int
    mean: tuple[float, float, float]
    std: tuple[float, float, float]
    model: torch.nn.Module
    transform: T.Compose


@dataclass
class LoadedEnsembleBundle:
    model_dir: Path
    device: torch.device
    device_label: str
    class_order: list[str]
    image_size: int
    class_bias: np.ndarray
    calibrated: bool
    members: list[LoadedMember]
    validation_settings: dict[str, Any]
    historical_report: dict[str, Any] | None
    load_duration_ms: float


class ModelLoadError(RuntimeError):
    """Raised when V5 artifacts are missing, malformed, or incompatible."""


def resolve_torch_device(requested: str) -> tuple[torch.device, str]:
    """Resolve CPU/CUDA execution device safely without assuming GPU presence."""
    mode = requested.strip().lower()
    if mode == "cpu":
        return torch.device("cpu"), "cpu"
    if mode in {"auto", "cuda"}:
        if torch.cuda.is_available():
            try:
                device = torch.device("cuda")
                probe = torch.zeros((1, 1), device=device)
                _ = (probe + 1.0).cpu()
                name = torch.cuda.get_device_name(0)
                return device, f"cuda ({name})"
            except Exception as err:  # pragma: no cover - hardware dependent
                if mode == "cuda":
                    raise ModelLoadError(f"CUDA requested but failed compatibility check: {err}") from err
                logger.warning("CUDA detected but failed smoke check; falling back to CPU: %s", err)
                return torch.device("cpu"), "cpu"
        if mode == "cuda":
            raise ModelLoadError("CUDA requested via V5_DEVICE=cuda, but CUDA is not available.")
        return torch.device("cpu"), "cpu"
    raise ModelLoadError(f"Unsupported V5_DEVICE setting: {requested}")


def _validate_norm_vector(vec: Any, name: str, ckpt_path: Path) -> tuple[float, float, float]:
    if not isinstance(vec, (list, tuple)) or len(vec) != 3:
        raise ModelLoadError(f"Checkpoint '{ckpt_path.name}' has invalid '{name}' normalization vector.")
    parsed = tuple(float(v) for v in vec)
    if not all(math.isfinite(v) for v in parsed):
        raise ModelLoadError(f"Checkpoint '{ckpt_path.name}' has non-finite '{name}' values.")
    if name == "std" and any(v <= 0.0 for v in parsed):
        raise ModelLoadError(f"Checkpoint '{ckpt_path.name}' has non-positive std values.")
    return parsed  # type: ignore[return-value]


def _safe_member_path(model_dir: Path, filename: str) -> Path:
    if not filename or Path(filename).name != filename:
        raise ModelLoadError(f"Unsafe checkpoint filename in settings: {filename!r}")
    resolved_dir = model_dir.resolve()
    candidate = (resolved_dir / filename).resolve()
    if candidate.parent != resolved_dir:
        raise ModelLoadError(f"Checkpoint path escapes model directory: {filename!r}")
    return candidate


def load_v5_bundle(model_dir: Path, requested_device: str = "cpu", warmup: bool = True) -> LoadedEnsembleBundle:
    """Load V5 validation settings, checkpoints, and optional historical report."""
    started = time.perf_counter()
    resolved_dir = model_dir.resolve()
    if not resolved_dir.is_dir():
        raise ModelLoadError(f"Model directory does not exist: {resolved_dir}")

    settings_path = resolved_dir / "selected_validation_settings.json"
    if not settings_path.is_file():
        raise ModelLoadError(f"Missing required settings file: {settings_path.name}")

    try:
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
    except Exception as err:
        raise ModelLoadError(f"Failed to parse {settings_path.name}: {err}") from err

    class_order = settings.get("class_order")
    if not isinstance(class_order, list) or not class_order or not all(isinstance(c, str) for c in class_order):
        raise ModelLoadError("Invalid or missing 'class_order' in selected_validation_settings.json.")

    image_size = settings.get("image_size")
    if not isinstance(image_size, int) or image_size <= 0:
        raise ModelLoadError("Invalid or missing 'image_size' in selected_validation_settings.json.")

    members_cfg = settings.get("members")
    if not isinstance(members_cfg, list) or not members_cfg:
        raise ModelLoadError("Invalid or missing 'members' list in selected_validation_settings.json.")

    class_bias_raw = settings.get("class_bias", [0.0] * len(class_order))
    if not isinstance(class_bias_raw, list) or len(class_bias_raw) != len(class_order):
        raise ModelLoadError("'class_bias' length does not match 'class_order'.")
    class_bias = np.asarray(class_bias_raw, dtype=np.float64)
    if not np.isfinite(class_bias).all():
        raise ModelLoadError("'class_bias' contains non-finite values.")

    device, device_label = resolve_torch_device(requested_device)
    loaded_members: list[LoadedMember] = []

    for entry in members_cfg:
        if not isinstance(entry, dict):
            raise ModelLoadError("Invalid member entry in selected_validation_settings.json.")
        filename = str(entry.get("filename", ""))
        model_name = str(entry.get("model_name", ""))
        kind = str(entry.get("kind", model_name))
        weight = float(entry.get("weight", 0.0))
        use_tta = bool(entry.get("use_tta", False))

        if not model_name:
            raise ModelLoadError(f"Missing 'model_name' for checkpoint {filename!r}.")
        if not math.isfinite(weight) or weight < 0.0:
            raise ModelLoadError(f"Invalid ensemble weight {weight!r} for {filename!r}.")

        ckpt_path = _safe_member_path(resolved_dir, filename)
        if not ckpt_path.is_file():
            raise ModelLoadError(f"Missing required checkpoint file: {ckpt_path.name}")

        try:
            checkpoint = torch.load(ckpt_path, map_location="cpu", weights_only=True)
        except Exception as err:
            raise ModelLoadError(f"Failed to load checkpoint '{ckpt_path.name}': {err}") from err

        if not isinstance(checkpoint, dict):
            raise ModelLoadError(f"Invalid checkpoint payload in '{ckpt_path.name}'.")

        if checkpoint.get("label_order") != class_order:
            raise ModelLoadError(
                f"Label order mismatch in '{ckpt_path.name}': expected {class_order}, got {checkpoint.get('label_order')}."
            )
        if checkpoint.get("model_name") != model_name:
            raise ModelLoadError(
                f"Model name mismatch in '{ckpt_path.name}': expected {model_name}, got {checkpoint.get('model_name')}."
            )

        state_dict = checkpoint.get("state_dict")
        if not isinstance(state_dict, dict) or not state_dict:
            raise ModelLoadError(f"Checkpoint '{ckpt_path.name}' is missing a valid 'state_dict'.")

        mean = _validate_norm_vector(checkpoint.get("mean"), "mean", ckpt_path)
        std = _validate_norm_vector(checkpoint.get("std"), "std", ckpt_path)

        try:
            model = timm.create_model(model_name, pretrained=False, num_classes=len(class_order))
            model.load_state_dict(state_dict, strict=True)
            model.to(device).eval()
        except Exception as err:
            raise ModelLoadError(f"Failed to instantiate/load '{model_name}' from '{ckpt_path.name}': {err}") from err

        if warmup:
            with torch.inference_mode():
                dummy = torch.zeros((1, 3, image_size, image_size), dtype=torch.float32, device=device)
                out = model(dummy)
                if tuple(out.shape) != (1, len(class_order)):
                    raise ModelLoadError(
                        f"Unexpected output shape {tuple(out.shape)} for '{model_name}'; expected (1, {len(class_order)})."
                    )
                if not torch.isfinite(out).all():
                    raise ModelLoadError(f"Non-finite warmup output from '{model_name}'.")

        transform = build_member_transform(image_size=image_size, mean=mean, std=std)
        loaded_members.append(
            LoadedMember(
                kind=kind,
                model_name=model_name,
                filename=filename,
                weight=weight,
                use_tta=use_tta,
                input_size=image_size,
                mean=mean,
                std=std,
                model=model,
                transform=transform,
            )
        )

    if sum(m.weight for m in loaded_members) <= 0.0:
        raise ModelLoadError("Total ensemble weight must be positive.")

    historical_report: dict[str, Any] | None = None
    report_path = resolved_dir / "final_test_report.json"
    if report_path.is_file():
        try:
            historical_report = json.loads(report_path.read_text(encoding="utf-8"))
        except Exception as err:
            logger.warning("Could not parse optional final_test_report.json: %s", err)

    load_duration_ms = round((time.perf_counter() - started) * 1000.0, 2)
    return LoadedEnsembleBundle(
        model_dir=resolved_dir,
        device=device,
        device_label=device_label,
        class_order=list(class_order),
        image_size=image_size,
        class_bias=class_bias,
        calibrated=bool(settings.get("calibrated", False)),
        members=loaded_members,
        validation_settings=settings,
        historical_report=historical_report,
        load_duration_ms=load_duration_ms,
    )
