"""Shared helpers to apply seeded role permission sets."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.rbac import PERMISSIONS, ROLE_PERMS
from app.models.identity import Permission, Role, RolePermission


def ensure_permission_catalog(db: Session) -> dict[str, int]:
    """Ensure all permission codes exist; return code -> id map."""
    for row in PERMISSIONS:
        code, en, ar = row[0], row[1], row[2]
        existing = db.query(Permission).filter(Permission.code == code).first()
        if not existing:
            db.add(Permission(code=code, name_en=en, name_ar=ar))
        else:
            # Keep labels in sync with catalog
            existing.name_en = en
            existing.name_ar = ar
    db.flush()
    return {p.code: p.id for p in db.query(Permission).all()}


def apply_system_role_permissions(db: Session) -> int:
    """
    Reset permissions for system roles (admin/manager/analyst/viewer)
    to ROLE_PERMS. Returns number of roles updated.
    """
    code_to_id = ensure_permission_catalog(db)
    updated = 0
    for code, perm_codes in ROLE_PERMS.items():
        role = db.query(Role).filter(Role.code == code, Role.deleted_at.is_(None)).first()
        if not role:
            continue
        role.is_system = True
        db.query(RolePermission).filter(RolePermission.role_id == role.id).delete()
        for pcode in perm_codes:
            pid = code_to_id.get(pcode)
            if pid:
                db.add(RolePermission(role_id=role.id, permission_id=pid))
        updated += 1
    return updated
