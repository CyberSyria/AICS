"""Lookups and app settings."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbSession, require_permissions
from app.core.errors import AppError
from app.core.mixins import utcnow
from app.models.identity import AppSetting, User
from app.models.lookups import (
    AssetType,
    FindingStatus,
    PhaseStatus,
    ProjectType,
    SeverityLevel,
    ToolCategory,
)
from app.schemas import (
    AssetTypeCreate,
    AssetTypeOut,
    FindingStatusCreate,
    FindingStatusOut,
    LookupBase,
    LookupOut,
    PhaseStatusCreate,
    PhaseStatusOut,
    SettingOut,
    SettingUpdate,
    SeverityCreate,
    SeverityOut,
)
from app.services.audit import write_audit

router = APIRouter(tags=["lookups", "settings"])


def _crud_list(db, model):
    return (
        db.query(model)
        .filter(model.deleted_at.is_(None))
        .order_by(model.sort_order, model.id)
        .all()
    )


@router.get("/lookups/project-types", response_model=list[LookupOut])
def project_types(db: DbSession, _: CurrentUser) -> list[LookupOut]:
    return [LookupOut.model_validate(x) for x in _crud_list(db, ProjectType)]


@router.post("/lookups/project-types", response_model=LookupOut, status_code=201)
def create_project_type(
    request: Request,
    body: LookupBase,
    db: DbSession,
    user: User = Depends(require_permissions("lookup.manage", "admin.all")),
) -> LookupOut:
    row = ProjectType(**body.model_dump())
    db.add(row)
    write_audit(db, action="lookup.project_type.create", user_id=user.id, request=request)
    db.commit()
    db.refresh(row)
    return LookupOut.model_validate(row)


@router.get("/lookups/asset-types", response_model=list[AssetTypeOut])
def asset_types(db: DbSession, _: CurrentUser) -> list[AssetTypeOut]:
    return [AssetTypeOut.model_validate(x) for x in _crud_list(db, AssetType)]


@router.post("/lookups/asset-types", response_model=AssetTypeOut, status_code=201)
def create_asset_type(
    request: Request,
    body: AssetTypeCreate,
    db: DbSession,
    user: User = Depends(require_permissions("lookup.manage", "admin.all")),
) -> AssetTypeOut:
    row = AssetType(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return AssetTypeOut.model_validate(row)


@router.get("/lookups/tool-categories", response_model=list[LookupOut])
def tool_categories(db: DbSession, _: CurrentUser) -> list[LookupOut]:
    return [LookupOut.model_validate(x) for x in _crud_list(db, ToolCategory)]


@router.post("/lookups/tool-categories", response_model=LookupOut, status_code=201)
def create_tool_category(
    body: LookupBase,
    db: DbSession,
    _: User = Depends(require_permissions("lookup.manage", "admin.all")),
) -> LookupOut:
    row = ToolCategory(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return LookupOut.model_validate(row)


@router.get("/lookups/severities", response_model=list[SeverityOut])
def severities(db: DbSession, _: CurrentUser) -> list[SeverityOut]:
    return [SeverityOut.model_validate(x) for x in _crud_list(db, SeverityLevel)]


@router.post("/lookups/severities", response_model=SeverityOut, status_code=201)
def create_severity(
    body: SeverityCreate,
    db: DbSession,
    _: User = Depends(require_permissions("lookup.manage", "admin.all")),
) -> SeverityOut:
    row = SeverityLevel(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return SeverityOut.model_validate(row)


@router.get("/lookups/finding-statuses", response_model=list[FindingStatusOut])
def finding_statuses(db: DbSession, _: CurrentUser) -> list[FindingStatusOut]:
    return [FindingStatusOut.model_validate(x) for x in _crud_list(db, FindingStatus)]


@router.post("/lookups/finding-statuses", response_model=FindingStatusOut, status_code=201)
def create_finding_status(
    body: FindingStatusCreate,
    db: DbSession,
    _: User = Depends(require_permissions("lookup.manage", "admin.all")),
) -> FindingStatusOut:
    row = FindingStatus(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return FindingStatusOut.model_validate(row)


@router.get("/lookups/phase-statuses", response_model=list[PhaseStatusOut])
def phase_statuses(db: DbSession, _: CurrentUser) -> list[PhaseStatusOut]:
    return [PhaseStatusOut.model_validate(x) for x in _crud_list(db, PhaseStatus)]


@router.post("/lookups/phase-statuses", response_model=PhaseStatusOut, status_code=201)
def create_phase_status(
    body: PhaseStatusCreate,
    db: DbSession,
    _: User = Depends(require_permissions("lookup.manage", "admin.all")),
) -> PhaseStatusOut:
    row = PhaseStatus(**body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return PhaseStatusOut.model_validate(row)


@router.get("/settings", response_model=list[SettingOut])
def list_settings(
    db: DbSession,
    _: User = Depends(require_permissions("settings.manage", "admin.all")),
) -> list[SettingOut]:
    return [SettingOut.model_validate(s) for s in db.query(AppSetting).order_by(AppSetting.key)]


@router.get("/settings/{key}", response_model=SettingOut)
def get_setting(key: str, db: DbSession, _: CurrentUser) -> SettingOut:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not row:
        raise AppError("not_found", "Setting not found", 404)
    return SettingOut.model_validate(row)


@router.put("/settings/{key}", response_model=SettingOut)
def upsert_setting(
    request: Request,
    key: str,
    body: SettingUpdate,
    db: DbSession,
    user: User = Depends(require_permissions("settings.manage", "admin.all")),
) -> SettingOut:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not row:
        row = AppSetting(key=key)
        db.add(row)
    if body.value is not None:
        row.value = body.value
    if body.value_json is not None:
        row.value_json = body.value_json
    row.updated_at = utcnow()
    write_audit(
        db,
        action="settings.update",
        user_id=user.id,
        entity_type="app_setting",
        after={"key": key},
        request=request,
    )
    db.commit()
    db.refresh(row)
    return SettingOut.model_validate(row)
