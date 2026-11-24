"""Bounded non-identifying operational metrics collector."""

from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass
from threading import Lock


@dataclass(frozen=True)
class MetricsSnapshot:
    total_requests: int
    successful_inferences: int
    failed_requests: int
    no_face_cases: int
    multiple_face_cases: int
    average_latency_ms: float | None
    p50_latency_ms: float | None
    p95_latency_ms: float | None
    sample_window_count: int
    uptime_seconds: float


class MetricsCollector:
    """Thread-safe aggregate operational metrics without storing user/image data."""

    def __init__(self, window_size: int = 500) -> None:
        self._lock = Lock()
        self._started_at = time.monotonic()
        self._total_requests = 0
        self._successful_inferences = 0
        self._failed_requests = 0
        self._no_face_cases = 0
        self._multiple_face_cases = 0
        self._latencies_ms: deque[float] = deque(maxlen=max(10, window_size))

    def record_success(self, latency_ms: float) -> None:
        with self._lock:
            self._total_requests += 1
            self._successful_inferences += 1
            self._latencies_ms.append(latency_ms)

    def record_no_face(self, latency_ms: float) -> None:
        with self._lock:
            self._total_requests += 1
            self._no_face_cases += 1
            self._latencies_ms.append(latency_ms)

    def record_multiple_faces(self, latency_ms: float) -> None:
        with self._lock:
            self._total_requests += 1
            self._multiple_face_cases += 1
            self._latencies_ms.append(latency_ms)

    def record_failure(self) -> None:
        with self._lock:
            self._total_requests += 1
            self._failed_requests += 1

    def snapshot(self) -> MetricsSnapshot:
        with self._lock:
            samples = sorted(self._latencies_ms)
            count = len(samples)
            avg_ms: float | None = None
            p50_ms: float | None = None
            p95_ms: float | None = None
            if count > 0:
                avg_ms = round(sum(samples) / count, 2)
                p50_ms = round(_percentile(samples, 0.50), 2)
                if count >= 5:
                    p95_ms = round(_percentile(samples, 0.95), 2)
            return MetricsSnapshot(
                total_requests=self._total_requests,
                successful_inferences=self._successful_inferences,
                failed_requests=self._failed_requests,
                no_face_cases=self._no_face_cases,
                multiple_face_cases=self._multiple_face_cases,
                average_latency_ms=avg_ms,
                p50_latency_ms=p50_ms,
                p95_latency_ms=p95_ms,
                sample_window_count=count,
                uptime_seconds=round(time.monotonic() - self._started_at, 2),
            )


def _percentile(sorted_values: list[float], q: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    pos = q * (len(sorted_values) - 1)
    lower = math.floor(pos)
    upper = math.ceil(pos)
    if lower == upper:
        return sorted_values[lower]
    fraction = pos - lower
    return sorted_values[lower] + fraction * (sorted_values[upper] - sorted_values[lower])
