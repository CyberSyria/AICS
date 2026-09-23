"""Append-only audit log helper — never update/delete audit rows."""

from __future__ import annotations

import json
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.platform import AuditLog

# Fields that must never appear in audit summaries
_REDACT_KEYS = {
    "password",
    "password_hash",
    "token",
    "secret",
    "csrf",
    "cookie",
    "authorization",
    "totp_secret",
    "access_key",
    "secret_key",
}


def _safe_summary(data: Any) -> str | None:
    if data is None:
        return None
    if isinstance(data, str):
        return data[:2000]
    if isinstance(data, dict):
        cleaned = {
            k: ("***" if k.lower() in _REDACT_KEYS or "password" in k.lower() else v)
            for k, v in data.items()
        }
        return json.dumps(cleaned, default=str)[:4000]
    return str(data)[:2000]


def write_audit(
    db: Session,
    *,
    action: str,
    user_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    before: Any = None,
    after: Any = None,
    request: Request | None = None,
) -> AuditLog:
    ip = None
    ua = None
    request_id = None
    if request is not None:
        ip = request.client.host if request.client else None
        ua = (request.headers.get("user-agent") or "")[:512]
        request_id = getattr(request.state, "request_id", None)

    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        ip_address=ip,
        user_agent=ua,
        before_summary=_safe_summary(before),
        after_summary=_safe_summary(after),
        request_id=request_id,
    )
    db.add(entry)
    db.flush()
    return entry
