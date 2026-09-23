"""In-app notification helpers."""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from app.core.rbac import has_permission
from app.models.identity import Role, RolePermission, User
from app.models.platform import Notification


def create_notification(
    db: Session,
    *,
    user_id: int,
    type: str,
    title_en: str,
    title_ar: str,
    body_en: str | None = None,
    body_ar: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
) -> Notification:
    n = Notification(
        user_id=user_id,
        type=type,
        title_en=title_en,
        title_ar=title_ar,
        body_en=body_en,
        body_ar=body_ar,
        entity_type=entity_type,
        entity_id=entity_id,
        is_read=False,
    )
    db.add(n)
    return n


def users_with_permission(db: Session, code: str) -> list[User]:
    users = (
        db.query(User)
        .options(
            joinedload(User.role)
            .joinedload(Role.role_permissions)
            .joinedload(RolePermission.permission)
        )
        .filter(User.deleted_at.is_(None), User.is_active.is_(True))
        .all()
    )
    return [u for u in users if has_permission(u, code)]


def notify_user(
    db: Session,
    user_id: int,
    *,
    type: str,
    title_en: str,
    title_ar: str,
    body_en: str | None = None,
    body_ar: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
) -> Notification:
    return create_notification(
        db,
        user_id=user_id,
        type=type,
        title_en=title_en,
        title_ar=title_ar,
        body_en=body_en,
        body_ar=body_ar,
        entity_type=entity_type,
        entity_id=entity_id,
    )


def notify_user_ids(
    db: Session,
    user_ids: set[int] | list[int],
    *,
    type: str,
    title_en: str,
    title_ar: str,
    body_en: str | None = None,
    body_ar: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    exclude_user_id: int | None = None,
) -> int:
    count = 0
    seen: set[int] = set()
    for uid in user_ids:
        if uid is None or uid in seen:
            continue
        if exclude_user_id is not None and uid == exclude_user_id:
            continue
        seen.add(uid)
        create_notification(
            db,
            user_id=uid,
            type=type,
            title_en=title_en,
            title_ar=title_ar,
            body_en=body_en,
            body_ar=body_ar,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        count += 1
    return count


def notify_permission_holders(
    db: Session,
    permission: str,
    *,
    type: str,
    title_en: str,
    title_ar: str,
    body_en: str | None = None,
    body_ar: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    exclude_user_id: int | None = None,
) -> int:
    return notify_user_ids(
        db,
        [u.id for u in users_with_permission(db, permission)],
        type=type,
        title_en=title_en,
        title_ar=title_ar,
        body_en=body_en,
        body_ar=body_ar,
        entity_type=entity_type,
        entity_id=entity_id,
        exclude_user_id=exclude_user_id,
    )


def notify_admins_and_leads(
    db: Session,
    *,
    type: str,
    title_en: str,
    title_ar: str,
    body_en: str | None = None,
    body_ar: str | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    exclude_user_id: int | None = None,
    extra_user_ids: set[int] | list[int] | None = None,
) -> int:
    """Notify admins + team leads (project.manage), plus any extra users (e.g. assigner)."""
    ids: set[int] = {u.id for u in users_with_permission(db, "admin.all")}
    ids |= {u.id for u in users_with_permission(db, "project.manage")}
    if extra_user_ids:
        ids |= {int(x) for x in extra_user_ids if x is not None}
    return notify_user_ids(
        db,
        ids,
        type=type,
        title_en=title_en,
        title_ar=title_ar,
        body_en=body_en,
        body_ar=body_ar,
        entity_type=entity_type,
        entity_id=entity_id,
        exclude_user_id=exclude_user_id,
    )
