"""Consistent API error envelope with request_id and machine-readable code."""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(
        self,
        code: str,
        detail: str,
        status_code: int = 400,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.code = code
        self.detail = detail
        self.status_code = status_code
        self.headers = headers
        super().__init__(detail)


def error_body(
    *,
    code: str,
    detail: str,
    request_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "detail": detail,
        "code": code,
        "request_id": request_id,
    }
    if extra:
        body.update(extra)
    return body


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(
            code=exc.code,
            detail=exc.detail,
            request_id=getattr(request.state, "request_id", None),
        ),
        headers=exc.headers,
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "http_error"
    if exc.status_code == 401:
        code = "unauthorized"
    elif exc.status_code == 403:
        code = "forbidden"
    elif exc.status_code == 404:
        code = "not_found"
    elif exc.status_code == 429:
        code = "rate_limited"
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=error_body(
            code=code,
            detail=detail,
            request_id=getattr(request.state, "request_id", None),
        ),
        headers=getattr(exc, "headers", None),
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content=error_body(
            code="validation_error",
            detail="Request validation failed",
            request_id=getattr(request.state, "request_id", None),
            extra={"errors": exc.errors()},
        ),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never expose stack traces in production responses
    return JSONResponse(
        status_code=500,
        content=error_body(
            code="internal_error",
            detail="An unexpected error occurred",
            request_id=getattr(request.state, "request_id", None),
        ),
    )
