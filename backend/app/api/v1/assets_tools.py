"""Assets and tools routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbSession, require_permissions
from app.core.errors import AppError
from app.core.mixins import utcnow
from app.models.identity import User
from app.models.security_data import Asset, Tool
from app.schemas import AssetCreate, AssetOut, ToolCreate, ToolOut, ToolUpdate
from app.schemas.common import Paginated
from app.services.access import assert_project_access, user_project_ids
from app.services.audit import write_audit

router = APIRouter(tags=["assets", "tools"])


def _tool_out(t: Tool) -> ToolOut:
    out = ToolOut.model_validate(t)
    out.name = t.name_en
    out.description = t.description_en
    return out


@router.get("/assets", response_model=Paginated[AssetOut])
def list_assets(
    db: DbSession,
    user: CurrentUser,
    project_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
) -> Paginated[AssetOut]:
    q = db.query(Asset).filter(Asset.deleted_at.is_(None))
    allowed = user_project_ids(db, user)
    if allowed is not None:
        q = q.filter(Asset.project_id.in_(allowed or {-1}))
    if project_id:
        assert_project_access(db, user, project_id)
        q = q.filter(Asset.project_id == project_id)
    total = q.count()
    rows = q.order_by(Asset.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Paginated(
        items=[AssetOut.model_validate(a) for a in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/assets", response_model=AssetOut, status_code=201)
def create_asset(
    request: Request,
    body: AssetCreate,
    db: DbSession,
    user: User = Depends(require_permissions("asset.manage", "project.manage", "admin.all")),
) -> AssetOut:
    assert_project_access(db, user, body.project_id)
    asset = Asset(**body.model_dump())
    db.add(asset)
    db.flush()
    write_audit(
        db,
        action="asset.create",
        user_id=user.id,
        entity_type="asset",
        entity_id=asset.id,
        request=request,
    )
    db.commit()
    db.refresh(asset)
    return AssetOut.model_validate(asset)


@router.patch("/assets/{asset_id}", response_model=AssetOut)
def update_asset(
    asset_id: int,
    body: AssetCreate,
    db: DbSession,
    user: User = Depends(require_permissions("asset.manage", "project.manage", "admin.all")),
) -> AssetOut:
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.deleted_at.is_(None)).first()
    if not asset:
        raise AppError("not_found", "Asset not found", 404)
    assert_project_access(db, user, asset.project_id)
    for k, v in body.model_dump(exclude={"project_id"}).items():
        setattr(asset, k, v)
    db.commit()
    db.refresh(asset)
    return AssetOut.model_validate(asset)


@router.delete("/assets/{asset_id}")
def delete_asset(
    asset_id: int,
    db: DbSession,
    user: User = Depends(require_permissions("asset.manage", "admin.all")),
) -> dict:
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.deleted_at.is_(None)).first()
    if not asset:
        raise AppError("not_found", "Asset not found", 404)
    assert_project_access(db, user, asset.project_id)
    asset.deleted_at = utcnow()
    db.commit()
    return {"detail": "Deleted", "code": "ok"}


@router.get("/tools", response_model=list[ToolOut])
def list_tools(db: DbSession, _: CurrentUser, active_only: bool = True) -> list[ToolOut]:
    q = db.query(Tool).filter(Tool.deleted_at.is_(None))
    if active_only:
        q = q.filter(Tool.is_active.is_(True))
    return [_tool_out(t) for t in q.order_by(Tool.name_en).all()]


@router.post("/tools", response_model=ToolOut, status_code=201)
def create_tool(
    request: Request,
    body: ToolCreate,
    db: DbSession,
    user: User = Depends(require_permissions("tool.manage", "admin.all")),
) -> ToolOut:
    payload = body.model_dump()
    if not payload.get("name_ar"):
        payload["name_ar"] = payload["name_en"]
    tool = Tool(**payload)
    db.add(tool)
    db.flush()
    write_audit(
        db,
        action="tool.create",
        user_id=user.id,
        entity_type="tool",
        entity_id=tool.id,
        request=request,
    )
    db.commit()
    db.refresh(tool)
    return _tool_out(tool)


@router.patch("/tools/{tool_id}", response_model=ToolOut)
def update_tool(
    tool_id: int,
    body: ToolUpdate,
    db: DbSession,
    _: User = Depends(require_permissions("tool.manage", "admin.all")),
) -> ToolOut:
    tool = db.query(Tool).filter(Tool.id == tool_id, Tool.deleted_at.is_(None)).first()
    if not tool:
        raise AppError("not_found", "Tool not found", 404)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(tool, k, v)
    db.commit()
    db.refresh(tool)
    return _tool_out(tool)


@router.delete("/tools/{tool_id}")
def delete_tool(
    tool_id: int,
    db: DbSession,
    _: User = Depends(require_permissions("tool.manage", "admin.all")),
) -> dict:
    tool = db.query(Tool).filter(Tool.id == tool_id, Tool.deleted_at.is_(None)).first()
    if not tool:
        raise AppError("not_found", "Tool not found", 404)
    tool.deleted_at = utcnow()
    db.commit()
    return {"detail": "Deleted", "code": "ok"}
