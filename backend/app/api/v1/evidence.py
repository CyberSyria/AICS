"""Evidence upload/download with storage abstraction."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response

from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, require_permissions
from app.core.mixins import utcnow
from app.models.identity import User
from app.models.security_data import Evidence
from app.schemas import EvidenceOut
from app.schemas.common import Paginated
from app.services.access import (
    assert_can_upload_evidence,
    assert_evidence_access,
    assert_project_access,
    user_project_ids,
)
from app.services.audit import write_audit
from app.storage import get_storage
from app.storage.base import random_storage_key, sha256_bytes, validate_upload

router = APIRouter(prefix="/evidence", tags=["evidence"])
settings = get_settings()


def _evidence_out(db, e: Evidence) -> EvidenceOut:
    from app.models.projects import Project

    out = EvidenceOut.model_validate(e)
    out.size = e.size_bytes
    proj = db.get(Project, e.project_id)
    if proj:
        out.project = {"id": proj.id, "name": proj.name}
    uploader = db.get(User, e.uploaded_by_id) if e.uploaded_by_id else None
    if uploader:
        out.uploaded_by = {"id": uploader.id, "full_name": uploader.full_name}
    return out


@router.get("", response_model=Paginated[EvidenceOut])
def list_evidence(
    db: DbSession,
    user: CurrentUser,
    project_id: int | None = None,
    phase_id: int | None = None,
    task_id: int | None = None,
    finding_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
) -> Paginated[EvidenceOut]:
    q = db.query(Evidence).filter(Evidence.deleted_at.is_(None))
    allowed = user_project_ids(db, user)
    if allowed is not None:
        q = q.filter(Evidence.project_id.in_(allowed or {-1}))
    if project_id:
        assert_project_access(db, user, project_id)
        q = q.filter(Evidence.project_id == project_id)
    if phase_id:
        q = q.filter(Evidence.phase_id == phase_id)
    if task_id:
        q = q.filter(Evidence.task_id == task_id)
    if finding_id:
        q = q.filter(Evidence.finding_id == finding_id)
    total = q.count()
    rows = q.order_by(Evidence.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Paginated(
        items=[_evidence_out(db, e) for e in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=EvidenceOut, status_code=201)
async def upload_evidence(
    request: Request,
    db: DbSession,
    user: User = Depends(require_permissions("evidence.upload", "admin.all")),
    file: UploadFile = File(...),
    project_id: int = Form(...),
    phase_id: int | None = Form(None),
    task_id: int | None = Form(None),
    finding_id: int | None = Form(None),
    asset_id: int | None = Form(None),
) -> EvidenceOut:
    assert_project_access(db, user, project_id)
    assert_can_upload_evidence(
        db, user, project_id, phase_id=phase_id, task_id=task_id, finding_id=finding_id
    )
    content = await file.read()
    safe_name, mime = validate_upload(file.filename or "file", content, file.content_type)
    key = random_storage_key(Path(safe_name).suffix)
    digest = sha256_bytes(content)
    get_storage().put(key, content, mime)

    evidence = Evidence(
        filename=safe_name,
        storage_key=key,
        mime_type=mime,
        size_bytes=len(content),
        sha256=digest,
        uploaded_by_id=user.id,
        project_id=project_id,
        phase_id=phase_id,
        task_id=task_id,
        finding_id=finding_id,
        asset_id=asset_id,
    )
    db.add(evidence)
    db.flush()
    write_audit(
        db,
        action="evidence.upload",
        user_id=user.id,
        entity_type="evidence",
        entity_id=evidence.id,
        after={
            "filename": safe_name,
            "sha256": digest,
            "size": len(content),
            "phase_id": phase_id,
            "task_id": task_id,
        },
        request=request,
    )
    db.commit()
    db.refresh(evidence)
    return _evidence_out(db, evidence)


@router.get("/{evidence_id}/download")
def download_evidence(
    evidence_id: int,
    db: DbSession,
    user: User = Depends(require_permissions("evidence.download", "admin.all")),
) -> Response:
    evidence = assert_evidence_access(db, user, evidence_id)
    data = get_storage().get(evidence.storage_key)
    return Response(
        content=data,
        media_type=evidence.mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{evidence.filename}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.delete("/{evidence_id}")
def delete_evidence(
    request: Request,
    evidence_id: int,
    db: DbSession,
    user: User = Depends(require_permissions("evidence.delete", "admin.all")),
) -> dict:
    evidence = assert_evidence_access(db, user, evidence_id)
    evidence.deleted_at = utcnow()
    write_audit(
        db,
        action="evidence.delete",
        user_id=user.id,
        entity_type="evidence",
        entity_id=evidence.id,
        request=request,
    )
    db.commit()
    # Soft delete metadata; blob retained for forensics (optional hard delete later)
    return {"detail": "Deleted", "code": "ok"}
