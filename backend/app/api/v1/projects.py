"""Projects, phases, members, progress."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import joinedload

from app.core.deps import CurrentUser, DbSession, require_permissions
from app.core.errors import AppError
from app.core.mixins import utcnow
from app.core.rbac import has_permission
from app.models.identity import User
from app.models.lookups import PhaseStatus
from app.models.platform import GeneratedReport
from app.models.projects import Project, ProjectMember, ProjectPhase, ProjectPhaseTool, Task
from app.models.security_data import Evidence, Finding, Tool
from app.schemas import (
    ProjectCreate,
    ProjectMemberOut,
    ProjectOut,
    ProjectPhaseOut,
    ProjectPhaseToolOut,
    ProjectPhaseToolUpdate,
    ProjectPhaseUpdate,
    ProjectUpdate,
    ReorderItem,
    UserBrief,
)
from app.schemas.common import Paginated
from app.services.access import assert_project_access, user_project_ids
from app.services.audit import write_audit
from app.services.projects import (
    compute_project_progress,
    create_project,
    validate_phase_transition,
)

router = APIRouter(prefix="/projects", tags=["projects"])

VALID_TOOL_STATUSES = {"unused", "in_use", "used"}


def _load_user(db, user_id: int | None) -> User | None:
    if not user_id:
        return None
    return (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.id == user_id)
        .first()
    )


def _user_brief(user: User | None) -> UserBrief | None:
    if not user:
        return None
    role = getattr(user, "role", None)
    return UserBrief(
        id=user.id,
        full_name=user.full_name,
        username=getattr(user, "username", None),
        email=getattr(user, "email", None),
        role_code=getattr(role, "code", None) if role else None,
        role_name_en=getattr(role, "name_en", None) if role else None,
        role_name_ar=getattr(role, "name_ar", None) if role else None,
    )


def _phase_days(phase: ProjectPhase, status_code: str | None = None) -> tuple[int | None, int | None]:
    allocated = None
    remaining = None
    if phase.planned_start and phase.planned_end:
        allocated = max((phase.planned_end - phase.planned_start).days + 1, 1)
    if phase.planned_end:
        code = (status_code or "").lower()
        if code in {"completed", "skipped"}:
            remaining = 0
        elif phase.planned_start and date.today() < phase.planned_start:
            # Window not started yet — full allocated days still ahead
            remaining = allocated
        else:
            remaining = (phase.planned_end - date.today()).days
    return allocated, remaining


def _phase_tools(db, phase: ProjectPhase) -> list[ProjectPhaseToolOut]:
    from app.models.lookups import ToolCategory

    rows = (
        db.query(ProjectPhaseTool)
        .filter(ProjectPhaseTool.phase_id == phase.id)
        .all()
    )
    out: list[ProjectPhaseToolOut] = []
    for row in rows:
        tool = db.get(Tool, row.tool_id)
        status = getattr(row, "usage_status", None) or ("used" if row.was_used else "unused")
        cat_name = None
        if tool and tool.category_id:
            cat = db.get(ToolCategory, tool.category_id)
            if cat:
                cat_name = cat.name_en
        out.append(
            ProjectPhaseToolOut(
                id=row.id,
                tool_id=row.tool_id,
                usage_status=status,
                was_used=bool(row.was_used) or status == "used",
                name_en=tool.name_en if tool else None,
                name_ar=tool.name_ar if tool else None,
                category=cat_name,
            )
        )
    return out


def _phase_out(db, phase: ProjectPhase, status_map: dict[int, str] | None = None) -> ProjectPhaseOut:
    if status_map is None:
        status_map = {s.id: s.code for s in db.query(PhaseStatus).all()}
    assignee = db.get(User, phase.assignee_id) if phase.assignee_id else None
    findings_count = (
        db.query(func.count(Finding.id))
        .filter(Finding.phase_id == phase.id, Finding.deleted_at.is_(None))
        .scalar()
        or 0
    )
    evidence_count = (
        db.query(func.count(Evidence.id))
        .filter(Evidence.phase_id == phase.id, Evidence.deleted_at.is_(None))
        .scalar()
        or 0
    )
    tasks_count = (
        db.query(func.count(Task.id))
        .filter(Task.phase_id == phase.id, Task.deleted_at.is_(None))
        .scalar()
        or 0
    )
    status_code = status_map.get(phase.status_id or -1)
    allocated, remaining = _phase_days(phase, status_code)
    return ProjectPhaseOut(
        id=phase.id,
        project_id=phase.project_id,
        name_en=phase.name_en,
        name_ar=phase.name_ar,
        sort_order=phase.sort_order,
        status_id=phase.status_id,
        status=status_code,
        status_reason=phase.status_reason,
        assignee_id=phase.assignee_id,
        assignee=_user_brief(assignee),
        planned_start=phase.planned_start,
        planned_end=phase.planned_end,
        actual_start=phase.actual_start,
        actual_end=phase.actual_end,
        estimated_duration_hours=phase.estimated_duration_hours,
        weight_percent=getattr(phase, "weight_percent", None),
        days_allocated=allocated,
        days_remaining=remaining,
        required_evidence=bool(phase.required_evidence),
        notes=phase.notes,
        findings_count=int(findings_count),
        evidence_count=int(evidence_count),
        tasks_count=int(tasks_count),
        tools=_phase_tools(db, phase),
    )


def _project_out(db, project: Project) -> ProjectOut:
    progress = compute_project_progress(db, project.id)
    status_map = {s.id: s.code for s in db.query(PhaseStatus).all()}
    phases = [
        _phase_out(db, p, status_map)
        for p in (project.phases or [])
        if not p.deleted_at
    ]
    phases.sort(key=lambda p: p.sort_order)

    members_out: list[ProjectMemberOut] = []
    seen_users: set[int] = set()
    for m in (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project.id)
        .all()
    ):
        user = _load_user(db, m.user_id)
        seen_users.add(m.user_id)
        members_out.append(
            ProjectMemberOut(
                id=m.id,
                user_id=m.user_id,
                role=m.role_label,
                role_label=m.role_label,
                user=_user_brief(user),
            )
        )

    # Include phase assignees even if not yet persisted as members (legacy projects)
    for phase in project.phases or []:
        if phase.deleted_at or not phase.assignee_id or phase.assignee_id in seen_users:
            continue
        user = _load_user(db, phase.assignee_id)
        members_out.append(
            ProjectMemberOut(
                id=-(phase.assignee_id),
                user_id=phase.assignee_id,
                role="assignee",
                role_label="assignee",
                user=_user_brief(user),
            )
        )
        seen_users.add(phase.assignee_id)

    if project.owner_id and project.owner_id not in seen_users:
        owner_user = _load_user(db, project.owner_id)
        members_out.append(
            ProjectMemberOut(
                id=-(project.owner_id),
                user_id=project.owner_id,
                role="owner",
                role_label="owner",
                user=_user_brief(owner_user),
            )
        )

    owner = _load_user(db, project.owner_id) if project.owner_id else None
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        project_type_id=project.project_type_id,
        status=project.status,
        priority=project.priority,
        owner_id=project.owner_id,
        owner=_user_brief(owner),
        client_name=project.client_name,
        client=project.client_name,
        business_unit=project.business_unit,
        start_date=project.start_date,
        due_date=project.due_date,
        completed_at=project.completed_at,
        workflow_id=project.workflow_id,
        scope_in=project.scope_in,
        scope_out=project.scope_out,
        rules_of_engagement=project.rules_of_engagement,
        environment=project.environment,
        tags=project.tags,
        progress_percent=progress,
        progress=progress,
        phases=phases,
        members=members_out,
    )


@router.get("", response_model=Paginated[ProjectOut])
def list_projects(
    db: DbSession,
    user: CurrentUser,
    page: int = 1,
    page_size: int = 20,
    status: str | None = None,
    q: str | None = None,
) -> Paginated[ProjectOut]:
    query = (
        db.query(Project)
        .options(joinedload(Project.phases))
        .filter(Project.deleted_at.is_(None))
    )
    allowed = user_project_ids(db, user)
    if allowed is not None:
        if not allowed:
            return Paginated(items=[], page=page, page_size=page_size, total=0)
        query = query.filter(Project.id.in_(allowed))
    if status:
        query = query.filter(Project.status == status)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Project.name.ilike(term),
                Project.client_name.ilike(term),
                Project.description.ilike(term),
            )
        )
    total = query.count()
    rows = query.order_by(Project.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Paginated(
        items=[_project_out(db, p) for p in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("", response_model=ProjectOut, status_code=201)
def create(
    request: Request,
    body: ProjectCreate,
    db: DbSession,
    user: User = Depends(require_permissions("project.create", "admin.all")),
) -> ProjectOut:
    project = create_project(db, body, creator_id=user.id)
    write_audit(
        db,
        action="project.create",
        user_id=user.id,
        entity_type="project",
        entity_id=project.id,
        after={"name": project.name, "workflow_id": project.workflow_id},
        request=request,
    )
    db.commit()
    project = (
        db.query(Project)
        .options(joinedload(Project.phases))
        .filter(Project.id == project.id)
        .first()
    )
    return _project_out(db, project)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: DbSession, user: CurrentUser) -> ProjectOut:
    project = assert_project_access(db, user, project_id)
    project = (
        db.query(Project)
        .options(joinedload(Project.phases))
        .filter(Project.id == project_id)
        .first()
    )
    return _project_out(db, project)


@router.get("/{project_id}/timeline", response_model=ProjectOut)
def project_timeline(project_id: int, db: DbSession, user: CurrentUser) -> ProjectOut:
    return get_project(project_id, db, user)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    request: Request,
    project_id: int,
    body: ProjectUpdate,
    db: DbSession,
    user: CurrentUser,
) -> ProjectOut:
    from app.services.projects import apply_project_update

    project = assert_project_access(db, user, project_id)
    if not (
        has_permission(user, "project.manage")
        or has_permission(user, "admin.all")
        or project.owner_id == user.id
    ):
        raise AppError("forbidden", "Cannot update this project", 403)
    apply_project_update(db, project, body)
    write_audit(
        db,
        action="project.update",
        user_id=user.id,
        entity_type="project",
        entity_id=project.id,
        after=body.model_dump(exclude_unset=True),
        request=request,
    )
    db.commit()
    return get_project(project_id, db, user)


@router.delete("/{project_id}")
def delete_project(
    request: Request,
    project_id: int,
    db: DbSession,
    user: User = Depends(require_permissions("project.delete", "admin.all")),
) -> dict:
    project = assert_project_access(db, user, project_id)
    now = utcnow()
    project.deleted_at = now
    # Soft-delete related rows so they don't linger as orphans
    for model in (Finding, Evidence, Task, GeneratedReport, ProjectPhase):
        (
            db.query(model)
            .filter(model.project_id == project_id, model.deleted_at.is_(None))
            .update({"deleted_at": now}, synchronize_session=False)
        )
    write_audit(
        db,
        action="project.delete",
        user_id=user.id,
        entity_type="project",
        entity_id=project.id,
        request=request,
    )
    db.commit()
    return {"detail": "Project deleted", "code": "ok"}


@router.get("/{project_id}/phases", response_model=list[ProjectPhaseOut])
def list_phases(project_id: int, db: DbSession, user: CurrentUser) -> list[ProjectPhaseOut]:
    assert_project_access(db, user, project_id)
    phases = (
        db.query(ProjectPhase)
        .filter(ProjectPhase.project_id == project_id, ProjectPhase.deleted_at.is_(None))
        .order_by(ProjectPhase.sort_order)
        .all()
    )
    status_map = {s.id: s.code for s in db.query(PhaseStatus).all()}
    return [_phase_out(db, p, status_map) for p in phases]


@router.patch("/{project_id}/phases/{phase_id}", response_model=ProjectPhaseOut)
def update_phase(
    request: Request,
    project_id: int,
    phase_id: int,
    body: ProjectPhaseUpdate,
    db: DbSession,
    user: CurrentUser,
) -> ProjectPhaseOut:
    assert_project_access(db, user, project_id)
    phase = (
        db.query(ProjectPhase)
        .filter(
            ProjectPhase.id == phase_id,
            ProjectPhase.project_id == project_id,
            ProjectPhase.deleted_at.is_(None),
        )
        .first()
    )
    if not phase:
        raise AppError("not_found", "Phase not found", 404)

    can_manage = has_permission(user, "admin.all") or has_permission(user, "phase.manage")
    is_assignee = phase.assignee_id == user.id
    if not can_manage and not is_assignee:
        raise AppError("forbidden", "Cannot update this phase", 403)

    data = body.model_dump(exclude_unset=True)
    # Assignees may only change status / status_reason
    if is_assignee and not can_manage:
        data = {k: v for k, v in data.items() if k in {"status", "status_id", "status_reason"}}

    tool_ids = data.pop("tool_ids", None)
    if tool_ids is not None and not can_manage:
        raise AppError("forbidden", "Only administrators can update phase tools", 403)

    prev_assignee = phase.assignee_id
    prev_status_id = phase.status_id
    prev_status_code = None
    if prev_status_id:
        prev_st = db.get(PhaseStatus, prev_status_id)
        prev_status_code = prev_st.code if prev_st else None

    if "status" in data:
        code = data.pop("status")
        if code:
            st = (
                db.query(PhaseStatus)
                .filter(PhaseStatus.code == code, PhaseStatus.deleted_at.is_(None))
                .first()
            )
            if not st:
                raise AppError("invalid_status", f"Unknown phase status: {code}", 400)
            data["status_id"] = st.id

    new_status_code = None
    if "status_id" in data and data["status_id"] is not None:
        validate_phase_transition(
            db, phase.status_id, data["status_id"], data.get("status_reason") or phase.status_reason
        )
        new_st = db.get(PhaseStatus, data["status_id"])
        if new_st:
            new_status_code = new_st.code
            from datetime import date as date_cls

            if new_st.code == "in_progress" and not phase.actual_start:
                data.setdefault("actual_start", date_cls.today())
            if new_st.code in {"completed", "skipped"} and not phase.actual_end:
                data.setdefault("actual_end", date_cls.today())

    for k, v in data.items():
        setattr(phase, k, v)
    if tool_ids is not None:
        from app.services.projects import replace_phase_tools

        replace_phase_tools(db, phase.id, [int(t) for t in tool_ids])
    write_audit(
        db,
        action="project.phase.update",
        user_id=user.id,
        entity_type="project_phase",
        entity_id=phase.id,
        after={**data, **({"tool_ids": tool_ids} if tool_ids is not None else {})},
        request=request,
    )

    from app.services.notifications import notify_admins_and_leads, notify_user

    # Notify newly assigned phase owner
    if (
        can_manage
        and phase.assignee_id
        and phase.assignee_id != prev_assignee
        and phase.assignee_id != user.id
    ):
        phase_label = phase.name_ar or phase.name_en or f"#{phase.id}"
        notify_user(
            db,
            phase.assignee_id,
            type="phase_assigned",
            title_en=f"Phase assigned: {phase.name_en or phase_label}",
            title_ar=f"تم إسناد مرحلة: {phase.name_ar or phase_label}",
            body_en=f"{user.full_name} assigned you to a project phase.",
            body_ar=f"أسند إليك {user.full_name} مرحلة في المشروع.",
            entity_type="project_phase",
            entity_id=phase.id,
        )

    # Notify admins + team leads when phase is completed
    if new_status_code == "completed" and prev_status_code != "completed":
        phase_label = phase.name_ar or phase.name_en or f"#{phase.id}"
        notify_admins_and_leads(
            db,
            type="phase_completed",
            title_en=f"Phase completed: {phase.name_en or phase_label}",
            title_ar=f"اكتملت المرحلة: {phase.name_ar or phase_label}",
            body_en=f"{user.full_name} marked the phase as completed.",
            body_ar=f"حدّد {user.full_name} حالة المرحلة كمكتملة.",
            entity_type="project_phase",
            entity_id=phase.id,
            exclude_user_id=user.id,
        )

    db.commit()
    db.refresh(phase)
    return _phase_out(db, phase)


@router.delete("/{project_id}/phases/{phase_id}")
def delete_phase(
    request: Request,
    project_id: int,
    phase_id: int,
    db: DbSession,
    user: User = Depends(require_permissions("phase.manage", "admin.all")),
) -> dict:
    assert_project_access(db, user, project_id)
    phase = (
        db.query(ProjectPhase)
        .filter(
            ProjectPhase.id == phase_id,
            ProjectPhase.project_id == project_id,
            ProjectPhase.deleted_at.is_(None),
        )
        .first()
    )
    if not phase:
        raise AppError("not_found", "Phase not found", 404)
    phase.deleted_at = utcnow()
    write_audit(
        db,
        action="project.phase.delete",
        user_id=user.id,
        entity_type="project_phase",
        entity_id=phase.id,
        request=request,
    )
    db.commit()
    return {"detail": "Phase deleted", "code": "ok"}


@router.patch(
    "/{project_id}/phases/{phase_id}/tools/{tool_link_id}",
    response_model=ProjectPhaseToolOut,
)
def update_phase_tool(
    request: Request,
    project_id: int,
    phase_id: int,
    tool_link_id: int,
    body: ProjectPhaseToolUpdate,
    db: DbSession,
    user: CurrentUser,
) -> ProjectPhaseToolOut:
    assert_project_access(db, user, project_id)
    phase = (
        db.query(ProjectPhase)
        .filter(
            ProjectPhase.id == phase_id,
            ProjectPhase.project_id == project_id,
            ProjectPhase.deleted_at.is_(None),
        )
        .first()
    )
    if not phase:
        raise AppError("not_found", "Phase not found", 404)
    if not has_permission(user, "admin.all") and not has_permission(user, "phase.manage"):
        raise AppError("forbidden", "Only administrators can update phase tools", 403)

    status = (body.usage_status or "").strip().lower()
    if status not in VALID_TOOL_STATUSES:
        raise AppError("invalid_status", "usage_status must be unused, in_use, or used", 400)

    link = (
        db.query(ProjectPhaseTool)
        .filter(ProjectPhaseTool.id == tool_link_id, ProjectPhaseTool.phase_id == phase_id)
        .first()
    )
    if not link:
        raise AppError("not_found", "Phase tool not found", 404)

    link.usage_status = status
    link.was_used = status == "used"
    write_audit(
        db,
        action="project.phase.tool.update",
        user_id=user.id,
        entity_type="project_phase_tool",
        entity_id=link.id,
        after={"usage_status": status},
        request=request,
    )
    db.commit()
    tool = db.get(Tool, link.tool_id)
    return ProjectPhaseToolOut(
        id=link.id,
        tool_id=link.tool_id,
        usage_status=status,
        was_used=link.was_used,
        name_en=tool.name_en if tool else None,
        name_ar=tool.name_ar if tool else None,
    )


@router.post("/{project_id}/phases/reorder")
def reorder_project_phases(
    project_id: int,
    items: list[ReorderItem],
    db: DbSession,
    user: User = Depends(require_permissions("project.manage", "admin.all")),
) -> dict:
    assert_project_access(db, user, project_id)
    for item in items:
        phase = (
            db.query(ProjectPhase)
            .filter(ProjectPhase.id == item.id, ProjectPhase.project_id == project_id)
            .first()
        )
        if phase:
            phase.sort_order = item.sort_order
    db.commit()
    return {"detail": "Reordered", "code": "ok"}


@router.get("/{project_id}/progress")
def project_progress(project_id: int, db: DbSession, user: CurrentUser) -> dict:
    assert_project_access(db, user, project_id)
    return {"project_id": project_id, "progress_percent": compute_project_progress(db, project_id)}


@router.post("/{project_id}/members")
def add_member(
    project_id: int,
    body: dict,
    db: DbSession,
    user: User = Depends(require_permissions("project.manage", "admin.all")),
) -> dict:
    assert_project_access(db, user, project_id)
    user_id = int(body.get("user_id"))
    role_label = body.get("role_label") or body.get("role")
    existing = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if existing:
        existing.role_label = role_label
    else:
        db.add(ProjectMember(project_id=project_id, user_id=user_id, role_label=role_label))
    db.commit()
    return {"detail": "Member added", "code": "ok"}
