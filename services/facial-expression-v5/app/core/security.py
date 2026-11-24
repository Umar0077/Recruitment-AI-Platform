"""Authentication, tester CSRF session management, and loopback checks."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Header, HTTPException, Request, status

LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost", "testclient"}
TESTER_COOKIE_NAME = "v5_tester_session"


def is_loopback_client(request: Request) -> bool:
    """Return True when the incoming request originates from loopback."""
    client_host = request.client.host if request.client else ""
    if client_host in LOOPBACK_HOSTS:
        return True
    if client_host.startswith("127."):
        return True
    return False


def verify_bearer_token(
    request: Request,
    authorization: str | None = Header(default=None),
) -> None:
    """Validate server-to-server Bearer token using constant-time comparison."""
    settings = request.app.state.v5.settings
    if not settings.has_service_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "SERVICE_TOKEN_NOT_CONFIGURED",
                "message": "Service authentication token is not configured.",
            },
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "UNAUTHORIZED",
                "message": "Missing or invalid Bearer token.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    provided = authorization[len("Bearer ") :]
    if not hmac.compare_digest(provided.encode("utf-8"), settings.v5_service_token.encode("utf-8")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "UNAUTHORIZED",
                "message": "Invalid service token.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )


class TesterSessionManager:
    """Ephemeral per-process HMAC-signed session and CSRF token manager for /tester."""

    def __init__(self, ttl_seconds: int = 14400) -> None:
        self._secret = secrets.token_bytes(32)
        self._ttl_seconds = ttl_seconds

    def issue_session(self) -> tuple[str, str]:
        """Return (cookie_value, csrf_token) bound together via HMAC."""
        session_id = secrets.token_urlsafe(24)
        issued_at = str(int(time.time()))
        payload = f"{session_id}.{issued_at}"
        sig = hmac.new(self._secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        cookie_value = f"{payload}.{sig}"
        csrf_token = hmac.new(
            self._secret, f"csrf.{cookie_value}".encode("utf-8"), hashlib.sha256
        ).hexdigest()
        return cookie_value, csrf_token

    def verify_session(self, cookie_value: str | None, csrf_token: str | None) -> bool:
        """Verify HttpOnly session cookie signature, TTL, and matching CSRF token."""
        if not cookie_value or not csrf_token:
            return False
        parts = cookie_value.split(".")
        if len(parts) != 3:
            return False
        session_id, issued_at_str, sig = parts
        if not session_id or not issued_at_str.isdigit():
            return False
        issued_at = int(issued_at_str)
        now = int(time.time())
        if issued_at > now + 60 or (now - issued_at) > self._ttl_seconds:
            return False
        payload = f"{session_id}.{issued_at_str}"
        expected_sig = hmac.new(self._secret, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            return False
        expected_csrf = hmac.new(
            self._secret, f"csrf.{cookie_value}".encode("utf-8"), hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(csrf_token, expected_csrf)


class InMemoryRateLimiter:
    """Simple sliding-window per-client rate limiter for local defense-in-depth."""

    def __init__(self, max_per_minute: int = 180) -> None:
        self._max_per_minute = max(1, max_per_minute)
        self._lock = Lock()
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - 60.0
        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= self._max_per_minute:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": "Too many inference requests. Slow down and retry.",
                    },
                )
            bucket.append(now)
