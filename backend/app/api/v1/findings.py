"""Findings, history, templates, retests."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbSession, require_permissions
from app.core.errors import AppError
from app.core.mixins import utcnow
from app.models.identity import User
from app.models.lookups import FindingStatus, SeverityLevel
from app.models.projects import Project
from app.models.security_data import Finding, FindingHistory, FindingTemplate, Retest
from app.schemas import (
    FindingCreate,
    FindingOut,
    FindingUpdate,
    RetestCreate,
    RetestUpdate,
)
from app.schemas.common import Paginated
from app.services.access import (
    assert_finding_access,
    assert_project_access,
    can_update_finding,
    user_project_ids,
)
from app.services.audit import write_audit
from app.services.findings import create_finding, update_finding

router = APIRouter(prefix="/findings", tags=["findings"])


def _finding_out(db, f: Finding) -> FindingOut:
    out = FindingOut.model_validate(f)
    out.human_id = f.public_id
    sev = db.get(SeverityLevel, f.severity_id) if f.severity_id else None
    if sev:
        out.severity = {
            "id": sev.id,
            "code": sev.code,
            "name_en": sev.name_en,
            "name_ar": sev.name_ar,
            "color_token": getattr(sev, "color_token", None),
        }
    st = db.get(FindingStatus, f.status_id) if f.status_id else None
    if st:
        out.status = {
            "id": st.id,
            "code": st.code,
            "name_en": st.name_en,
            "name_ar": st.name_ar,
        }
    proj = db.get(Project, f.project_id)
    if proj:
        out.project = {"id": proj.id, "name": proj.name}
    if f.reporter_id:
        reporter = db.get(User, f.reporter_id)
        if reporter:
            out.reporter = {
                "id": reporter.id,
                "full_name": reporter.full_name,
                "username": reporter.username,
            }
    if f.assignee_id:
        assignee = db.get(User, f.assignee_id)
        if assignee:
            out.assignee = {
                "id": assignee.id,
                "full_name": assignee.full_name,
                "username": assignee.username,
            }
    return out


@router.get("/templates/list")
def list_templates(db: DbSession, _: CurrentUser) -> list[dict]:
    rows = (
        db.query(FindingTemplate)
        .filter(FindingTemplate.deleted_at.is_(None), FindingTemplate.is_active.is_(True))
        .all()
    )
    return [
        {
            "id": t.id,
            "title_en": t.title_en,
            "title_ar": t.title_ar,
            "severity_id": t.severity_id,
            "cwe": t.cwe,
        }
        for t in rows
    ]


@router.get("", response_model=Paginated[FindingOut])
def list_findings(
    db: DbSession,
    user: CurrentUser,
    project_id: int | None = None,
    severity_id: int | None = None,
    status_id: int | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> Paginated[FindingOut]:
    from sqlalchemy import or_

    query = db.query(Finding).filter(Finding.deleted_at.is_(None))
    allowed = user_project_ids(db, user)
    if allowed is not None:
        query = query.filter(Finding.project_id.in_(allowed or {-1}))
    if project_id:
        assert_project_access(db, user, project_id)
        query = query.filter(Finding.project_id == project_id)
    if severity_id:
        query = query.filter(Finding.severity_id == severity_id)
    if status_id:
        query = query.filter(Finding.status_id == status_id)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(Finding.title.ilike(term), Finding.public_id.ilike(term)))
    total = query.count()
    rows = query.order_by(Finding.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Paginated(
        items=[_finding_out(db, f) for f in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=FindingOut, status_code=201)
def create(
    request: Request,
    body: FindingCreate,
    db: DbSession,
    user: User = Depends(
        require_permissions("finding.create", "finding.update", "admin.all")
    ),
) -> FindingOut:
    assert_project_access(db, user, body.project_id)
    from app.services.access import assert_can_create_finding

    assert_can_create_finding(
        db, user, body.project_id, phase_id=getattr(body, "phase_id", None)
    )
    finding = create_finding(db, body, reporter_id=user.id)
    write_audit(
        db,
        action="finding.create",
        user_id=user.id,
        entity_type="finding",
        entity_id=finding.id,
        after={"public_id": finding.public_id, "title": finding.title},
        request=request,
    )
    from app.services.notifications import notify_permission_holders

    notify_permission_holders(
        db,
        "admin.all",
        type="finding_submitted",
        title_en=f"New finding pending review: {finding.public_id}",
        title_ar=f"ثغرة جديدة بانتظار المراجعة: {finding.public_id}",
        body_en=f"{user.full_name} submitted «{finding.title}» for review.",
        body_ar=f"أرسل {user.full_name} الثغرة «{finding.title}» للمراجعة.",
        entity_type="finding",
        entity_id=finding.id,
        exclude_user_id=user.id,
    )
    db.commit()
    db.refresh(finding)
    return _finding_out(db, finding)


@router.get("/{finding_id}", response_model=FindingOut)
def get_finding(finding_id: int, db: DbSession, user: CurrentUser) -> FindingOut:
    finding = assert_finding_access(db, user, finding_id)
    return _finding_out(db, finding)


@router.patch("/{finding_id}", response_model=FindingOut)
def patch_finding(
    request: Request,
    finding_id: int,
    body: FindingUpdate,
    db: DbSession,
    user: CurrentUser,
) -> FindingOut:
    from app.core.deps import verify_csrf

    verify_csrf(request)
    finding = assert_finding_access(db, user, finding_id)
    if not can_update_finding(user, finding):
        raise AppError("forbidden", "Cannot update this finding", 403)
    update_finding(db, finding, body, user_id=user.id)
    write_audit(
        db,
        action="finding.update",
        user_id=user.id,
        entity_type="finding",
        entity_id=finding.id,
        after=body.model_dump(exclude_unset=True),
        request=request,
    )
    db.commit()
    db.refresh(finding)
    return _finding_out(db, finding)


@router.post("/{finding_id}/confirm", response_model=FindingOut)
def confirm_finding(
    request: Request,
    finding_id: int,
    db: DbSession,
    user: User = Depends(require_permissions("finding.confirm", "admin.all")),
) -> FindingOut:
    """Admin confirmation: move finding from in_review → confirmed."""
    from app.core.deps import verify_csrf

    verify_csrf(request)
    finding = assert_finding_access(db, user, finding_id)
    confirmed = (
        db.query(FindingStatus)
        .filter(FindingStatus.code == "confirmed", FindingStatus.deleted_at.is_(None))
        .first()
    )
    if not confirmed:
        raise AppError("invalid_status", "Confirmed status is not configured", 400)
    old_id = finding.status_id
    finding.status_id = confirmed.id
    db.add(
        FindingHistory(
            finding_id=finding.id,
            user_id=user.id,
            field_name="status_id",
            old_value=str(old_id) if old_id is not None else None,
            new_value=str(confirmed.id),
        )
    )
    write_audit(
        db,
        action="finding.confirm",
        user_id=user.id,
        entity_type="finding",
        entity_id=finding.id,
        after={"status": "confirmed"},
        request=request,
    )
    db.commit()
    db.refresh(finding)
    return _finding_out(db, finding)


@router.delete("/{finding_id}")
def delete_finding(
    request: Request,
    finding_id: int,
    db: DbSession,
    user: User = Depends(require_permissions("finding.delete", "admin.all")),
) -> dict:
    finding = (
        db.query(Finding)
        .filter(Finding.id == finding_id, Finding.deleted_at.is_(None))
        .first()
    )
    if not finding:
        raise AppError("not_found", "Finding not found", 404)
    # Allow orphan cleanup when the parent project was soft-deleted
    project = (
        db.query(Project)
        .filter(Project.id == finding.project_id, Project.deleted_at.is_(None))
        .first()
    )
    if project is not None:
        assert_finding_access(db, user, finding_id)
    finding.deleted_at = utcnow()
    # public_id is retained — counter never reuses
    write_audit(
        db,
        action="finding.delete",
        user_id=user.id,
        entity_type="finding",
        entity_id=finding.id,
        after={"public_id": finding.public_id},
        request=request,
    )
    db.commit()
    return {"detail": "Deleted", "code": "ok"}


@router.get("/{finding_id}/history")
def finding_history(finding_id: int, db: DbSession, user: CurrentUser) -> list[dict]:
    assert_finding_access(db, user, finding_id)
    rows = (
        db.query(FindingHistory)
        .filter(FindingHistory.finding_id == finding_id)
        .order_by(FindingHistory.id)
        .all()
    )
    return [
        {
            "id": h.id,
            "field_name": h.field_name,
            "old_value": h.old_value,
            "new_value": h.new_value,
            "user_id": h.user_id,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        }
        for h in rows
    ]


@router.post("/{finding_id}/retests", status_code=201)
def request_retest(
    request: Request,
    finding_id: int,
    body: RetestCreate,
    db: DbSession,
    user: CurrentUser,
) -> dict:
    from app.core.deps import verify_csrf

    verify_csrf(request)
    finding = assert_finding_access(db, user, finding_id)
    retest = Retest(
        finding_id=finding.id,
        requested_by_id=user.id,
        assigned_to_id=body.assigned_to_id,
        notes=body.notes,
        status="requested",
    )
    db.add(retest)
    db.commit()
    return {"id": retest.id, "detail": "Retest requested", "code": "ok"}


@router.patch("/{finding_id}/retests/{retest_id}")
def update_retest(
    finding_id: int,
    retest_id: int,
    body: RetestUpdate,
    db: DbSession,
    user: CurrentUser,
) -> dict:
    assert_finding_access(db, user, finding_id)
    retest = (
        db.query(Retest)
        .filter(Retest.id == retest_id, Retest.finding_id == finding_id)
        .first()
    )
    if not retest:
        raise AppError("not_found", "Retest not found", 404)
    if body.status not in {"verified", "failed"}:
        raise AppError("invalid_status", "Status must be verified or failed", 400)
    retest.status = body.status
    retest.notes = body.notes or retest.notes
    retest.completed_at = utcnow()
    db.commit()
    return {"detail": "Retest updated", "code": "ok"}
