"""Authentication routes — cookie sessions + CSRF double-submit."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import joinedload

from app.core.config import get_settings
from app.core.deps import (
    CurrentUser,
    DbSession,
    clear_session_cookies,
    require_auth_csrf,
    set_session_cookies,
)
from app.core.errors import AppError
from app.core.rate_limit import check_rate_limit, parse_rate_limit
from app.core.rbac import user_permission_codes
from app.core.security import (
    create_session_token,
    generate_csrf_token,
    hash_password,
    needs_rehash,
    password_meets_policy,
    verify_password,
)
from app.models.identity import Role, RolePermission, User, UserPreferences
from app.schemas.auth import LoginRequest, MeOut, PasswordChangeRequest, PreferencesUpdate, UserOut
from app.services.audit import write_audit

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

AuthUser = Annotated[User, Depends(require_auth_csrf)]


def _user_out(user: User, csrf: str | None = None) -> MeOut | UserOut:
    perms = sorted(user_permission_codes(user))
    data = UserOut.model_validate(user)
    data.permissions = perms
    if csrf is not None:
        return MeOut(**data.model_dump(), csrf_token=csrf)
    return data


@router.post("/login", response_model=MeOut)
def login(request: Request, response: Response, body: LoginRequest, db: DbSession) -> MeOut:
    ip = request.client.host if request.client else "unknown"
    limit, window = parse_rate_limit(settings.RATE_LIMIT_LOGIN)
    check_rate_limit(f"login:{ip}", limit=limit, window=window)

    user = (
        db.query(User)
        .options(
            joinedload(User.role)
            .joinedload(Role.role_permissions)
            .joinedload(RolePermission.permission),
            joinedload(User.preferences),
        )
        .filter(User.username == body.username, User.deleted_at.is_(None))
        .first()
    )
    if not user or not verify_password(body.password, user.password_hash):
        write_audit(
            db,
            action="auth.login_failed",
            after={"username": body.username},
            request=request,
        )
        db.commit()
        raise AppError("invalid_credentials", "Invalid username or password", 401)

    if not user.is_active:
        raise AppError("account_disabled", "Account is disabled", 403)

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)

    user.last_login_at = datetime.now(timezone.utc)
    session_token = create_session_token(user.id)
    csrf = generate_csrf_token()
    set_session_cookies(response, session_token, csrf)
    write_audit(
        db,
        action="auth.login",
        user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    db.commit()
    db.refresh(user)
    return _user_out(user, csrf=csrf)  # type: ignore[return-value]


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    db: DbSession,
    user: AuthUser,
) -> dict:
    clear_session_cookies(response)
    write_audit(
        db, action="auth.logout", user_id=user.id, entity_type="user", entity_id=user.id, request=request
    )
    db.commit()
    return {"detail": "Logged out", "code": "ok"}


@router.get("/me", response_model=MeOut)
def me(request: Request, user: CurrentUser) -> MeOut:
    csrf = request.cookies.get(settings.CSRF_COOKIE_NAME)
    return _user_out(user, csrf=csrf)  # type: ignore[return-value]


@router.post("/change-password")
def change_password(
    request: Request,
    body: PasswordChangeRequest,
    db: DbSession,
    user: AuthUser,
) -> dict:
    if not verify_password(body.current_password, user.password_hash):
        raise AppError("invalid_credentials", "Current password is incorrect", 400)
    ok, code = password_meets_policy(body.new_password)
    if not ok:
        raise AppError(code or "weak_password", "Password does not meet policy", 400)
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    write_audit(
        db,
        action="auth.password_change",
        user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    db.commit()
    return {"detail": "Password updated", "code": "ok"}


@router.patch("/preferences", response_model=UserOut)
def update_preferences(
    request: Request,
    body: PreferencesUpdate,
    db: DbSession,
    user: AuthUser,
) -> UserOut:
    prefs = user.preferences
    if not prefs:
        prefs = UserPreferences(user_id=user.id)
        db.add(prefs)
        db.flush()
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(prefs, k, v)
    db.commit()
    db.refresh(user)
    return _user_out(user)  # type: ignore[return-value]


@router.get("/csrf")
def get_csrf(request: Request, response: Response, user: CurrentUser) -> dict:
    """Refresh CSRF cookie for authenticated SPA clients."""
    csrf = generate_csrf_token()
    token = request.cookies.get(settings.SESSION_COOKIE_NAME) or create_session_token(user.id)
    set_session_cookies(response, token, csrf)
    return {"csrf_token": csrf}
