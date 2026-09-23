"""Workflow template CRUD, phases, reorder, duplicate."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import joinedload

from app.core.deps import CurrentUser, DbSession, require_permissions
from app.core.errors import AppError
from app.core.mixins import utcnow
from app.models.identity import User
from app.models.workflows import (
    Workflow,
    WorkflowPhase,
    WorkflowPhaseChecklistItem,
    WorkflowPhaseTool,
)
from app.schemas import (
    ChecklistItemCreate,
    ReorderItem,
    WorkflowCreate,
    WorkflowOut,
    WorkflowPhaseCreate,
    WorkflowPhaseOut,
    WorkflowUpdate,
)
from app.services.audit import write_audit

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _phase_out(phase: WorkflowPhase) -> WorkflowPhaseOut:
    out = WorkflowPhaseOut.model_validate(phase)
    out.tool_ids = [t.tool_id for t in phase.tools]
    out.checklist_items = phase.checklist_items
    return out


def _workflow_out(wf: Workflow) -> WorkflowOut:
    out = WorkflowOut.model_validate(wf)
    out.phases = [_phase_out(p) for p in wf.phases if not p.deleted_at]
    return out


def _load_workflow(db, workflow_id: int) -> Workflow:
    wf = (
        db.query(Workflow)
        .options(
            joinedload(Workflow.phases).joinedload(WorkflowPhase.tools),
            joinedload(Workflow.phases).joinedload(WorkflowPhase.checklist_items),
        )
        .filter(Workflow.id == workflow_id, Workflow.deleted_at.is_(None))
        .first()
    )
    if not wf:
        raise AppError("not_found", "Workflow not found", 404)
    return wf


@router.get("", response_model=list[WorkflowOut])
def list_workflows(db: DbSession, _: CurrentUser) -> list[WorkflowOut]:
    rows = (
        db.query(Workflow)
        .options(
            joinedload(Workflow.phases).joinedload(WorkflowPhase.tools),
            joinedload(Workflow.phases).joinedload(WorkflowPhase.checklist_items),
        )
        .filter(Workflow.deleted_at.is_(None))
        .order_by(Workflow.id)
        .all()
    )
    return [_workflow_out(w) for w in rows]


@router.get("/{workflow_id}", response_model=WorkflowOut)
def get_workflow(workflow_id: int, db: DbSession, _: CurrentUser) -> WorkflowOut:
    return _workflow_out(_load_workflow(db, workflow_id))


@router.post("", response_model=WorkflowOut, status_code=201)
def create_workflow(
    request: Request,
    body: WorkflowCreate,
    db: DbSession,
    user: User = Depends(require_permissions("workflow.manage", "admin.all")),
) -> WorkflowOut:
    wf = Workflow(
        name_en=body.name_en,
        name_ar=body.name_ar,
        description_en=body.description_en,
        description_ar=body.description_ar,
        project_type_id=body.project_type_id,
        is_active=body.is_active,
    )
    db.add(wf)
    db.flush()
    for ph in body.phases:
        _add_phase(db, wf.id, ph)
    write_audit(
        db,
        action="workflow.create",
        user_id=user.id,
        entity_type="workflow",
        entity_id=wf.id,
        request=request,
    )
    db.commit()
    return _workflow_out(_load_workflow(db, wf.id))


def _add_phase(db, workflow_id: int, ph: WorkflowPhaseCreate) -> WorkflowPhase:
    phase = WorkflowPhase(
        workflow_id=workflow_id,
        name_en=ph.name_en,
        name_ar=ph.name_ar,
        description_en=ph.description_en,
        description_ar=ph.description_ar,
        sort_order=ph.sort_order,
        estimated_duration_hours=ph.estimated_duration_hours,
        required_evidence=ph.required_evidence,
        enabled=ph.enabled,
        default_assignee_id=ph.default_assignee_id,
    )
    db.add(phase)
    db.flush()
    for tid in ph.tool_ids:
        db.add(WorkflowPhaseTool(phase_id=phase.id, tool_id=tid))
    for item in ph.checklist_items:
        db.add(
            WorkflowPhaseChecklistItem(
                phase_id=phase.id,
                title_en=item.title_en,
                title_ar=item.title_ar,
                description_en=item.description_en,
                description_ar=item.description_ar,
                reference_id=item.reference_id,
                is_mandatory=item.is_mandatory,
                sort_order=item.sort_order,
            )
        )
    return phase


@router.patch("/{workflow_id}", response_model=WorkflowOut)
def update_workflow(
    request: Request,
    workflow_id: int,
    body: WorkflowUpdate,
    db: DbSession,
    user: User = Depends(require_permissions("workflow.manage", "admin.all")),
) -> WorkflowOut:
    wf = _load_workflow(db, workflow_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(wf, k, v)
    write_audit(
        db,
        action="workflow.update",
        user_id=user.id,
        entity_type="workflow",
        entity_id=wf.id,
        request=request,
    )
    db.commit()
    return _workflow_out(_load_workflow(db, workflow_id))


@router.delete("/{workflow_id}")
def delete_workflow(
    request: Request,
    workflow_id: int,
    db: DbSession,
    user: User = Depends(require_permissions("workflow.manage", "admin.all")),
) -> dict:
    wf = _load_workflow(db, workflow_id)
    wf.deleted_at = utcnow()
    write_audit(
        db,
        action="workflow.delete",
        user_id=user.id,
        entity_type="workflow",
        entity_id=wf.id,
        request=request,
    )
    db.commit()
    return {"detail": "Workflow deleted", "code": "ok"}


@router.post("/{workflow_id}/phases", response_model=WorkflowPhaseOut, status_code=201)
def add_phase(
    workflow_id: int,
    body: WorkflowPhaseCreate,
    db: DbSession,
    _: User = Depends(require_permissions("workflow.manage", "admin.all")),
) -> WorkflowPhaseOut:
    _load_workflow(db, workflow_id)
    phase = _add_phase(db, workflow_id, body)
    db.commit()
    db.refresh(phase)
    return _phase_out(phase)


@router.post("/{workflow_id}/reorder")
def reorder_phases(
    workflow_id: int,
    items: list[ReorderItem],
    db: DbSession,
    _: User = Depends(require_permissions("workflow.manage", "admin.all")),
) -> dict:
    _load_workflow(db, workflow_id)
    for item in items:
        phase = (
            db.query(WorkflowPhase)
            .filter(WorkflowPhase.id == item.id, WorkflowPhase.workflow_id == workflow_id)
            .first()
        )
        if phase:
            phase.sort_order = item.sort_order
    db.commit()
    return {"detail": "Reordered", "code": "ok"}


@router.post("/{workflow_id}/duplicate", response_model=WorkflowOut, status_code=201)
def duplicate_workflow(
    request: Request,
    workflow_id: int,
    db: DbSession,
    user: User = Depends(require_permissions("workflow.manage", "admin.all")),
) -> WorkflowOut:
    src = _load_workflow(db, workflow_id)
    clone = Workflow(
        name_en=f"{src.name_en} (copy)",
        name_ar=f"{src.name_ar} (نسخة)",
        description_en=src.description_en,
        description_ar=src.description_ar,
        project_type_id=src.project_type_id,
        version=src.version + 1,
        is_active=True,
        parent_workflow_id=src.id,
    )
    db.add(clone)
    db.flush()
    for ph in src.phases:
        if ph.deleted_at:
            continue
        new_ph = WorkflowPhase(
            workflow_id=clone.id,
            name_en=ph.name_en,
            name_ar=ph.name_ar,
            description_en=ph.description_en,
            description_ar=ph.description_ar,
            sort_order=ph.sort_order,
            estimated_duration_hours=ph.estimated_duration_hours,
            required_evidence=ph.required_evidence,
            enabled=ph.enabled,
            default_assignee_id=ph.default_assignee_id,
        )
        db.add(new_ph)
        db.flush()
        for t in ph.tools:
            db.add(WorkflowPhaseTool(phase_id=new_ph.id, tool_id=t.tool_id))
        for item in ph.checklist_items:
            if item.deleted_at:
                continue
            db.add(
                WorkflowPhaseChecklistItem(
                    phase_id=new_ph.id,
                    title_en=item.title_en,
                    title_ar=item.title_ar,
                    description_en=item.description_en,
                    description_ar=item.description_ar,
                    reference_id=item.reference_id,
                    is_mandatory=item.is_mandatory,
                    sort_order=item.sort_order,
                )
            )
    write_audit(
        db,
        action="workflow.duplicate",
        user_id=user.id,
        entity_type="workflow",
        entity_id=clone.id,
        before={"source_id": src.id},
        request=request,
    )
    db.commit()
    return _workflow_out(_load_workflow(db, clone.id))


@router.post("/{workflow_id}/phases/{phase_id}/checklist", status_code=201)
def add_checklist_item(
    workflow_id: int,
    phase_id: int,
    body: ChecklistItemCreate,
    db: DbSession,
    _: User = Depends(require_permissions("workflow.manage", "admin.all")),
) -> dict:
    phase = (
        db.query(WorkflowPhase)
        .filter(
            WorkflowPhase.id == phase_id,
            WorkflowPhase.workflow_id == workflow_id,
            WorkflowPhase.deleted_at.is_(None),
        )
        .first()
    )
    if not phase:
        raise AppError("not_found", "Phase not found", 404)
    item = WorkflowPhaseChecklistItem(phase_id=phase.id, **body.model_dump())
    db.add(item)
    db.commit()
    return {"id": item.id, "detail": "Created", "code": "ok"}
