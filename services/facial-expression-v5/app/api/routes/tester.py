"""Loopback-only developer webcam & photo tester routes (no long-lived token in HTML/JS)."""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile, status
from fastapi.responses import HTMLResponse

from app.api.routes.v1 import build_model_info_payload
from app.core.security import TESTER_COOKIE_NAME, is_loopback_client
from app.schemas.api import FrameInferenceResponse, ModelInfoResponse

STATIC_TESTER_PATH = Path(__file__).resolve().parents[2] / "static" / "tester.html"

router = APIRouter(prefix="/tester", tags=["developer-tester"], include_in_schema=False)


def _require_loopback_and_enabled(request: Request) -> None:
    state = request.app.state.v5
    if not state.settings.v5_enable_tester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tester disabled.")
    if not is_loopback_client(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Developer tester is restricted to loopback requests.",
        )


def _require_tester_csrf(request: Request, csrf_header: str | None) -> None:
    _require_loopback_and_enabled(request)
    origin = request.headers.get("origin")
    if origin:
        parsed = urlparse(origin)
        if parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid origin.")
    cookie_value = request.cookies.get(TESTER_COOKIE_NAME)
    state = request.app.state.v5
    if not state.tester_sessions.verify_session(cookie_value, csrf_header):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TESTER_SESSION_INVALID", "message": "Reload /tester to refresh local session."},
        )


@router.get("", response_class=HTMLResponse)
async def tester_page(request: Request) -> HTMLResponse:
    """Serve the local developer tester UI with an HttpOnly session cookie + CSRF token."""
    _require_loopback_and_enabled(request)
    state = request.app.state.v5
    cookie_value, csrf_token = state.tester_sessions.issue_session()
    html = STATIC_TESTER_PATH.read_text(encoding="utf-8").replace("__V5_CSRF_TOKEN__", csrf_token)
    response = HTMLResponse(content=html, headers={"Cache-Control": "no-store"})
    response.set_cookie(
        key=TESTER_COOKIE_NAME,
        value=cookie_value,
        httponly=True,
        samesite="strict",
        path="/tester",
        max_age=14400,
    )
    return response


@router.get("/api/status", response_model=ModelInfoResponse)
async def tester_status(
    request: Request,
    x_v5_csrf_token: str | None = Header(default=None),
) -> ModelInfoResponse:
    """Return model readiness and metadata for the local tester UI."""
    _require_tester_csrf(request, x_v5_csrf_token)
    return build_model_info_payload(request)


@router.post("/api/infer", response_model=FrameInferenceResponse)
async def tester_infer(
    request: Request,
    file: UploadFile = File(...),
    x_v5_csrf_token: str | None = Header(default=None),
) -> FrameInferenceResponse:
    """Run V5 inference for the local loopback developer tester UI."""
    _require_tester_csrf(request, x_v5_csrf_token)
    state = request.app.state.v5
    state.rate_limiter.check("tester-loopback")

    max_bytes = state.settings.v5_max_upload_bytes
    try:
        data = await file.read(max_bytes + 1)
    finally:
        await file.close()

    if len(data) > max_bytes:
        state.metrics.record_failure()
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail={
                "code": "PAYLOAD_TOO_LARGE",
                "message": f"Image exceeds maximum allowed size of {max_bytes} bytes.",
            },
        )

    return await state.inference_service.infer_frame(data)
