"""Environment-driven configuration for the Facial Expression V5 service."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = SERVICE_ROOT.parents[1] if len(SERVICE_ROOT.parents) >= 2 else SERVICE_ROOT
DEFAULT_MODEL_DIR = REPO_ROOT / "_local_model_inputs" / "v5"


class Settings(BaseSettings):
    """Typed runtime settings loaded from environment variables and optional .env."""

    model_config = SettingsConfigDict(
        env_file=str(SERVICE_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    service_name: str = "InterviewOS Facial Expression V5 Engine"
    service_version: str = "1.0.0"
    model_version: str = "v5"

    v5_host: str = Field(default="127.0.0.1")
    v5_port: int = Field(default=8765, ge=1024, le=65535)
    v5_model_dir: Path = Field(default=DEFAULT_MODEL_DIR)
    v5_device: Literal["cpu", "auto", "cuda"] = Field(default="cpu")
    v5_service_token: str = Field(default="")

    v5_max_upload_bytes: int = Field(default=10_000_000, ge=1024, le=50_000_000)
    v5_max_decoded_pixels: int = Field(default=12_000_000, ge=2_304, le=100_000_000)
    v5_inference_timeout_seconds: float = Field(default=15.0, ge=0.5, le=120.0)
    v5_max_concurrent_inferences: int = Field(default=2, ge=1, le=16)
    v5_rate_limit_per_minute: int = Field(default=180, ge=1, le=10_000)

    v5_face_margin_ratio: float = Field(default=0.18, ge=0.0, le=0.6)
    v5_uncertain_threshold: float = Field(default=0.45, ge=0.0, le=1.0)
    v5_metrics_window_size: int = Field(default=500, ge=10, le=10_000)

    v5_warmup_on_startup: bool = Field(default=True)
    v5_enable_tester: bool = Field(default=True)
    v5_log_level: str = Field(default="INFO")

    @field_validator("v5_model_dir", mode="before")
    @classmethod
    def _resolve_model_dir(cls, value: str | Path | None) -> Path:
        if value is None or str(value).strip() == "":
            return DEFAULT_MODEL_DIR
        path = Path(value)
        if not path.is_absolute():
            path = (SERVICE_ROOT / path).resolve()
        return path

    @field_validator("v5_host")
    @classmethod
    def _validate_host(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("V5_HOST must not be empty")
        return cleaned

    @field_validator("v5_log_level")
    @classmethod
    def _validate_log_level(cls, value: str) -> str:
        upper = value.strip().upper()
        if upper not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError(f"Unsupported V5_LOG_LEVEL: {value}")
        return upper

    @property
    def is_loopback_host(self) -> bool:
        return self.v5_host in {"127.0.0.1", "localhost", "::1"}

    @property
    def has_service_token(self) -> bool:
        return bool(self.v5_service_token and self.v5_service_token.strip())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings instance for the active process."""
    return Settings()


def clear_settings_cache() -> None:
    """Reset cached settings (primarily for automated tests)."""
    get_settings.cache_clear()
