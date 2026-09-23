"""FastAPI dependencies: DB session, current user, permissions, CSRF."""

from __future__ import annotations

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.core.database import get_db
from app.core.errors import AppError
from app.core.rbac import has_permission
from app.core.security import parse_session_token
from app.models.identity import Role, RolePermission, User

settings = get_settings()

DbSession = Annotated[Session, Depends(get_db)]


def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def _load_user(db: Session, user_id: int) -> User | None:
    return (
        db.query(User)
        .options(
            joinedload(User.role)
            .joinedload(Role.role_permissions)
            .joinedload(RolePermission.permission),
            joinedload(User.preferences),
        )
        .filter(User.id == user_id, User.deleted_at.is_(None))
        .first()
    )


def get_current_user(request: Request, db: DbSession) -> User:
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        raise AppError("unauthorized", "Authentication required", 401)
    payload = parse_session_token(token)
    if not payload:
        raise AppError("unauthorized", "Invalid or expired session", 401)
    user = _load_user(db, payload.user_id)
    if not user or not user.is_active:
        raise AppError("unauthorized", "Account disabled or not found", 401)
    request.state.user = user
    return user


def get_optional_user(request: Request, db: DbSession) -> User | None:
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        return None
    payload = parse_session_token(token)
    if not payload:
        return None
    return _load_user(db, payload.user_id)


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def verify_csrf(request: Request) -> None:
    """Double-submit CSRF: cookie value must match X-CSRF-Token header."""
    if request.method in SAFE_METHODS:
        return
    cookie_token = request.cookies.get(settings.CSRF_COOKIE_NAME)
    header_token = request.headers.get("X-CSRF-Token")
    if not cookie_token or not header_token or cookie_token != header_token:
        raise AppError("csrf_failed", "CSRF token missing or invalid", 403)


def require_permissions(*codes: str) -> Callable:
    def dependency(user: CurrentUser, request: Request) -> User:
        verify_csrf(request)
        if not any(has_permission(user, c) for c in codes):
            raise AppError("forbidden", "Insufficient permissions", 403)
        return user

    return dependency


def require_auth_csrf(user: CurrentUser, request: Request) -> User:
    verify_csrf(request)
    return user


def set_session_cookies(response: Response, session_token: str, csrf_token: str) -> None:
    common = {
        "httponly": True,
        "secure": settings.COOKIE_SECURE,
        "samesite": settings.COOKIE_SAMESITE,
        "max_age": settings.SESSION_MAX_AGE_SECONDS,
        "path": "/",
    }
    if settings.COOKIE_DOMAIN:
        common["domain"] = settings.COOKIE_DOMAIN
    response.set_cookie(settings.SESSION_COOKIE_NAME, session_token, **common)
    # CSRF cookie must be readable by JS
    csrf_opts = {**common, "httponly": False}
    response.set_cookie(settings.CSRF_COOKIE_NAME, csrf_token, **csrf_opts)


def clear_session_cookies(response: Response) -> None:
    for name in (settings.SESSION_COOKIE_NAME, settings.CSRF_COOKIE_NAME):
        response.delete_cookie(name, path="/", domain=settings.COOKIE_DOMAIN)
