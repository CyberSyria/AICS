"""Users and roles management."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import joinedload

from app.core.deps import CurrentUser, DbSession, require_permissions
from app.core.errors import AppError
from app.core.mixins import utcnow
from app.core.rbac import has_permission
from app.core.security import hash_password, password_meets_policy
from app.models.identity import Permission, Role, RolePermission, User, UserPreferences
from app.schemas.auth import (
    PasswordResetRequest,
    PermissionOut,
    RoleCreate,
    RoleOut,
    RoleUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.schemas.common import Paginated
from app.services.audit import write_audit
from app.services.rbac_sync import apply_system_role_permissions

router = APIRouter(tags=["users", "roles"])


def _role_out(role: Role) -> RoleOut:
    perms = [
        PermissionOut.model_validate(rp.permission)
        for rp in role.role_permissions
        if rp.permission
    ]
    out = RoleOut.model_validate(role)
    out.permissions = perms
    return out


def _user_out(user: User) -> UserOut:
    out = UserOut.model_validate(user)
    return out


@router.get("/users", response_model=Paginated[UserOut])
def list_users(
    db: DbSession,
    page: int = 1,
    page_size: int = 20,
    _: User = Depends(require_permissions("user.read", "user.manage", "admin.all")),
) -> Paginated[UserOut]:
    q = db.query(User).options(joinedload(User.role)).filter(User.deleted_at.is_(None))
    total = q.count()
    items = (
        q.order_by(User.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return Paginated(
        items=[_user_out(u) for u in items],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    request: Request,
    body: UserCreate,
    db: DbSession,
    actor: User = Depends(require_permissions("user.manage", "admin.all")),
) -> UserOut:
    ok, code = password_meets_policy(body.password)
    if not ok:
        raise AppError(code or "weak_password", "Password does not meet policy", 400)
    if db.query(User).filter(User.username == body.username).first():
        raise AppError("username_taken", "Username already registered", 409)
    if body.email and db.query(User).filter(User.email == body.email.lower()).first():
        raise AppError("email_taken", "Email already registered", 409)
    role = db.query(Role).filter(Role.id == body.role_id, Role.deleted_at.is_(None)).first()
    if not role:
        raise AppError("invalid_role", "Role not found", 400)
    user = User(
        username=body.username,
        email=body.email.lower().strip() if body.email else None,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        role_id=body.role_id,
        is_active=body.is_active,
        must_change_password=True,
    )
    db.add(user)
    db.flush()
    db.add(UserPreferences(user_id=user.id))
    write_audit(
        db,
        action="user.create",
        user_id=actor.id,
        entity_type="user",
        entity_id=user.id,
        after={"username": user.username, "role": role.code},
        request=request,
    )
    db.commit()
    user = (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.id == user.id)
        .first()
    )
    return _user_out(user)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    request: Request,
    user_id: int,
    body: UserUpdate,
    db: DbSession,
    actor: User = Depends(require_permissions("user.manage", "admin.all")),
) -> UserOut:
    user = (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.id == user_id, User.deleted_at.is_(None))
        .first()
    )
    if not user:
        raise AppError("not_found", "User not found", 404)
    data = body.model_dump(exclude_unset=True)
    if "role_id" in data and data["role_id"] is not None:
        role = db.query(Role).filter(Role.id == data["role_id"], Role.deleted_at.is_(None)).first()
        if not role:
            raise AppError("invalid_role", "Role not found", 400)
    before = {"full_name": user.full_name, "role_id": user.role_id, "is_active": user.is_active}
    for k, v in data.items():
        setattr(user, k, v)
    write_audit(
        db,
        action="user.update",
        user_id=actor.id,
        entity_type="user",
        entity_id=user.id,
        before=before,
        after=data,
        request=request,
    )
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.post("/users/{user_id}/reset-password")
def reset_password(
    request: Request,
    user_id: int,
    body: PasswordResetRequest,
    db: DbSession,
    actor: User = Depends(require_permissions("user.manage", "admin.all")),
) -> dict:
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise AppError("not_found", "User not found", 404)
    ok, code = password_meets_policy(body.new_password)
    if not ok:
        raise AppError(code or "weak_password", "Password does not meet policy", 400)
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = body.must_change
    write_audit(
        db,
        action="user.password_reset",
        user_id=actor.id,
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    db.commit()
    return {"detail": "Password reset", "code": "ok"}


@router.delete("/users/{user_id}")
def soft_delete_user(
    request: Request,
    user_id: int,
    db: DbSession,
    actor: User = Depends(require_permissions("user.manage", "admin.all")),
) -> dict:
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise AppError("not_found", "User not found", 404)
    if user.id == actor.id:
        raise AppError("cannot_delete_self", "Cannot delete your own account", 400)
    user.deleted_at = utcnow()
    user.is_active = False
    write_audit(
        db,
        action="user.delete",
        user_id=actor.id,
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    db.commit()
    return {"detail": "User deleted", "code": "ok"}


@router.get("/roles", response_model=list[RoleOut])
def list_roles(
    db: DbSession,
    _: User = Depends(require_permissions("role.manage", "user.read", "admin.all")),
) -> list[RoleOut]:
    roles = (
        db.query(Role)
        .options(joinedload(Role.role_permissions).joinedload(RolePermission.permission))
        .filter(Role.deleted_at.is_(None))
        .order_by(Role.id)
        .all()
    )
    return [_role_out(r) for r in roles]


@router.get("/permissions", response_model=list[PermissionOut])
def list_permissions(
    db: DbSession,
    _: User = Depends(require_permissions("role.manage", "admin.all")),
) -> list[PermissionOut]:
    from app.core.rbac import permission_category

    return [
        PermissionOut(
            id=p.id,
            code=p.code,
            name_en=p.name_en,
            name_ar=p.name_ar,
            category=permission_category(p.code),
        )
        for p in db.query(Permission).order_by(Permission.code)
    ]


@router.post("/roles", response_model=RoleOut, status_code=201)
def create_role(
    request: Request,
    body: RoleCreate,
    db: DbSession,
    actor: User = Depends(require_permissions("role.manage", "admin.all")),
) -> RoleOut:
    if db.query(Role).filter(Role.code == body.code).first():
        raise AppError("code_taken", "Role code already exists", 409)
    role = Role(
        code=body.code,
        name_en=body.name_en,
        name_ar=body.name_ar,
        description_en=body.description_en,
        description_ar=body.description_ar,
        is_system=False,
    )
    db.add(role)
    db.flush()
    for pid in body.permission_ids:
        db.add(RolePermission(role_id=role.id, permission_id=pid))
    write_audit(
        db,
        action="role.create",
        user_id=actor.id,
        entity_type="role",
        entity_id=role.id,
        after=body.model_dump(),
        request=request,
    )
    db.commit()
    db.refresh(role)
    return _role_out(role)


@router.patch("/roles/{role_id}", response_model=RoleOut)
def update_role(
    request: Request,
    role_id: int,
    body: RoleUpdate,
    db: DbSession,
    actor: User = Depends(require_permissions("role.manage", "admin.all")),
) -> RoleOut:
    role = (
        db.query(Role)
        .options(joinedload(Role.role_permissions).joinedload(RolePermission.permission))
        .filter(Role.id == role_id, Role.deleted_at.is_(None))
        .first()
    )
    if not role:
        raise AppError("not_found", "Role not found", 404)
    data = body.model_dump(exclude_unset=True)
    perms = data.pop("permission_ids", None)
    if role.is_system and perms is not None:
        # Only full admin may customize built-in role permission sets
        if not has_permission(actor, "admin.all"):
            raise AppError(
                "system_role_locked",
                "System role permissions require admin.all. "
                "Create a custom role or ask an administrator.",
                400,
            )
    for k, v in data.items():
        setattr(role, k, v)
    if perms is not None:
        db.query(RolePermission).filter(RolePermission.role_id == role.id).delete()
        for pid in perms:
            db.add(RolePermission(role_id=role.id, permission_id=pid))
    write_audit(
        db,
        action="role.update",
        user_id=actor.id,
        entity_type="role",
        entity_id=role.id,
        after=body.model_dump(exclude_unset=True),
        request=request,
    )
    db.commit()
    db.refresh(role)
    return _role_out(role)


@router.post("/roles/reset-system")
def reset_system_roles(
    request: Request,
    db: DbSession,
    actor: User = Depends(require_permissions("role.manage", "admin.all")),
) -> dict:
    """Restore admin/manager/analyst/viewer permissions to seed defaults."""
    count = apply_system_role_permissions(db)
    write_audit(
        db,
        action="role.reset_system",
        user_id=actor.id,
        entity_type="role",
        after={"roles_updated": count},
        request=request,
    )
    db.commit()
    return {"detail": "System roles restored", "code": "ok", "roles_updated": count}


@router.post("/roles/{role_id}/reset", response_model=RoleOut)
def reset_role(
    request: Request,
    role_id: int,
    db: DbSession,
    actor: User = Depends(require_permissions("role.manage", "admin.all")),
) -> RoleOut:
    role = db.query(Role).filter(Role.id == role_id, Role.deleted_at.is_(None)).first()
    if not role:
        raise AppError("not_found", "Role not found", 404)
    if not role.is_system:
        raise AppError("not_system_role", "Only system roles can be reset to defaults", 400)
    apply_system_role_permissions(db)
    write_audit(
        db,
        action="role.reset",
        user_id=actor.id,
        entity_type="role",
        entity_id=role.id,
        after={"code": role.code},
        request=request,
    )
    db.commit()
    role = (
        db.query(Role)
        .options(joinedload(Role.role_permissions).joinedload(RolePermission.permission))
        .filter(Role.id == role_id)
        .first()
    )
    return _role_out(role)
