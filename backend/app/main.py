"""
FastAPI application entrypoint.

Session auth: HttpOnly cookie + CSRF double-submit (see app.core.security).
"""

from __future__ import annotations

import secrets
import time

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app import __version__
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import engine
from app.core.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.core.security import parse_session_token

settings = get_settings()


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or secrets.token_hex(8)
        request.state.request_id = request_id
        start = time.perf_counter()
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{(time.perf_counter() - start) * 1000:.1f}ms"
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        if settings.is_production:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        # CSP kept permissive for /docs Swagger UI; tighten when serving SPA from same origin
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
            "script-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
        )
        return response


def create_app() -> FastAPI:
    if settings.ENVIRONMENT != "test":
        settings.validate_for_startup()

    app = FastAPI(
        title=settings.APP_NAME,
        version=__version__,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-CSRF-Token"],
    )

    app.include_router(api_router)

    @app.on_event("startup")
    def _sync_system_roles() -> None:
        """Ensure permission catalog exists; do not overwrite customized role perms."""
        if settings.ENVIRONMENT == "test":
            return
        from app.core.database import SessionLocal
        from app.services.rbac_sync import ensure_permission_catalog

        db = SessionLocal()
        try:
            ensure_permission_catalog(db)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

    @app.on_event("startup")
    def _ensure_schema_columns() -> None:
        """Add columns introduced after initial create_all (SQLite-friendly)."""
        if settings.ENVIRONMENT == "test":
            return
        from sqlalchemy import inspect, text

        from app.core.database import engine

        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        if "tasks" not in tables:
            return
        cols = {c["name"] for c in inspector.get_columns("tasks")}
        if "assigned_by_id" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN assigned_by_id INTEGER"))

    @app.on_event("startup")
    def _ensure_tool_catalog() -> None:
        """Ensure suggested tools exist and workflow phases have tool links."""
        if settings.ENVIRONMENT == "test":
            return
        from app.core.database import SessionLocal
        from app.seed import _seed_lookups, _seed_tools, _seed_workflow_phase_tools

        db = SessionLocal()
        try:
            _seed_lookups(db)
            _seed_tools(db)
            _seed_workflow_phase_tools(db)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

    @app.on_event("startup")
    def _start_due_soon_notifier() -> None:
        """Background loop: due-soon / overdue in-app notifications (every 6h)."""
        if settings.ENVIRONMENT == "test":
            return
        import logging
        import threading

        log = logging.getLogger("samp.notifier")

        def _run_once() -> None:
            try:
                from app.cli import notify_overdue

                # click command — invoke underlying logic via callback
                notify_overdue.callback()  # type: ignore[misc]
            except Exception:
                log.exception("due-soon notifier failed")

        def _loop() -> None:
            # First pass shortly after boot, then every 6 hours
            time.sleep(15)
            while True:
                _run_once()
                time.sleep(6 * 60 * 60)

        threading.Thread(target=_loop, name="samp-due-notifier", daemon=True).start()

    @app.get("/health", tags=["health"])
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/health/db", tags=["health"])
    def health_db(request: Request) -> dict:
        """DB health — requires authenticated session (no internals leaked)."""
        from fastapi.responses import JSONResponse

        from app.core.errors import AppError

        token = request.cookies.get(settings.SESSION_COOKIE_NAME)
        if not token or not parse_session_token(token):
            raise AppError("unauthorized", "Authentication required", 401)
        try:
            with engine.connect() as conn:
                conn.exec_driver_sql("SELECT 1")
            return {"status": "ok", "database": "up"}
        except Exception:
            return JSONResponse(
                status_code=503,
                content={"status": "error", "database": "down"},
            )

    return app


app = create_app()
