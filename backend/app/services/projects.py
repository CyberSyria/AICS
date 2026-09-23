"""Project creation with workflow snapshot and progress calculation."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session, joinedload

from app.models.lookups import PhaseStatus
from app.models.projects import (
    Project,
    ProjectMember,
    ProjectPhase,
    ProjectPhaseTool,
    Task,
)
from app.models.security_data import Tool
from app.models.workflows import Workflow, WorkflowPhase
from app.schemas import ProjectCreate, ProjectMemberIn, ProjectUpdate


def _pending_status_id(db: Session) -> int | None:
    st = (
        db.query(PhaseStatus)
        .filter(PhaseStatus.code == "pending", PhaseStatus.deleted_at.is_(None))
        .first()
    )
    return st.id if st else None


def _schedule_phases(
    phases: list[ProjectPhase],
    start: date | None,
    end: date | None,
) -> None:
    """Assign planned_start/planned_end from weight_percent across the project window."""
    if not phases:
        return
    if not start:
        start = date.today()
    if not end or end <= start:
        end = start + timedelta(days=max(7, len(phases) * 3))

    total_days = max((end - start).days + 1, len(phases))
    weights = [max(float(p.weight_percent or 0), 0.0) for p in phases]
    weight_sum = sum(weights)
    if weight_sum <= 0:
        weights = [100.0 / len(phases)] * len(phases)
        weight_sum = 100.0

    raw = [
        0 if w <= 0 else max(1, round(total_days * (w / weight_sum)))
        for w in weights
    ]
    nonzero = [i for i, d in enumerate(raw) if d > 0]
    drift = total_days - sum(raw)
    i = 0
    while drift != 0 and nonzero:
        idx = nonzero[i % len(nonzero)]
        raw[idx] = max(1, raw[idx] + (1 if drift > 0 else -1))
        drift = total_days - sum(raw)
        i += 1
        if i > 500:
            break

    cursor = start
    for phase, days in zip(phases, raw):
        if days <= 0:
            phase.planned_start = cursor
            phase.planned_end = cursor
            phase.estimated_duration_hours = 0.0
            continue
        phase.planned_start = cursor
        phase.planned_end = cursor + timedelta(days=max(days - 1, 0))
        phase.estimated_duration_hours = float(days * 8)
        cursor = phase.planned_end + timedelta(days=1)


def _active_tool_ids(db: Session, tool_ids: list[int]) -> list[int]:
    if not tool_ids:
        return []
    rows = (
        db.query(Tool.id)
        .filter(
            Tool.id.in_([int(t) for t in tool_ids]),
            Tool.deleted_at.is_(None),
            Tool.is_active.is_(True),
        )
        .all()
    )
    return [r[0] for r in rows]


def replace_phase_tools(db: Session, phase_id: int, tool_ids: list[int]) -> None:
    """Replace project-phase tool links with the given active tool ids."""
    active = _active_tool_ids(db, tool_ids)
    db.query(ProjectPhaseTool).filter(ProjectPhaseTool.phase_id == phase_id).delete()
    for tid in active:
        db.add(
            ProjectPhaseTool(
                phase_id=phase_id,
                tool_id=tid,
                usage_status="unused",
                was_used=False,
            )
        )


def snapshot_workflow_to_project(
    db: Session,
    project: Project,
    workflow: Workflow,
    phase_assignees: dict[int, int] | None = None,
    selected_phase_ids: list[int] | None = None,
    phase_weights: dict[int, float] | None = None,
    phase_tool_ids: dict[int, list[int]] | None = None,
) -> None:
    """Copy selected workflow phases/tools/checklists into project tables."""
    phase_assignees = phase_assignees or {}
    phase_weights = phase_weights or {}
    phase_tool_ids = phase_tool_ids or {}
    pending_id = _pending_status_id(db)

    q = (
        db.query(WorkflowPhase)
        .options(
            joinedload(WorkflowPhase.tools),
            joinedload(WorkflowPhase.checklist_items),
        )
        .filter(
            WorkflowPhase.workflow_id == workflow.id,
            WorkflowPhase.deleted_at.is_(None),
            WorkflowPhase.enabled.is_(True),
        )
        .order_by(WorkflowPhase.sort_order)
    )
    phases = q.all()
    if selected_phase_ids:
        allow = set(int(x) for x in selected_phase_ids)
        phases = [p for p in phases if p.id in allow]

    if not phases:
        return

    if not phase_weights:
        eq = 100.0 / len(phases)
        phase_weights = {p.id: eq for p in phases}
    else:
        missing = [p for p in phases if p.id not in phase_weights]
        used = sum(float(phase_weights.get(p.id, 0)) for p in phases if p.id in phase_weights)
        rem = max(0.0, 100.0 - used)
        if missing:
            share = rem / len(missing) if rem > 0 else (100.0 / len(phases))
            for p in missing:
                phase_weights[p.id] = share

    created: list[ProjectPhase] = []
    for idx, wp in enumerate(phases):
        assignee = phase_assignees.get(wp.id) or wp.default_assignee_id
        weight = float(phase_weights.get(wp.id, 0) or 0)
        pp = ProjectPhase(
            project_id=project.id,
            source_workflow_phase_id=wp.id,
            name_en=wp.name_en,
            name_ar=wp.name_ar,
            description_en=wp.description_en,
            description_ar=wp.description_ar,
            sort_order=idx,
            status_id=pending_id,
            assignee_id=assignee,
            estimated_duration_hours=wp.estimated_duration_hours,
            weight_percent=weight,
            required_evidence=wp.required_evidence,
        )
        db.add(pp)
        db.flush()
        created.append(pp)

        custom_tools = phase_tool_ids.get(wp.id)
        if custom_tools is not None:
            replace_phase_tools(db, pp.id, list(custom_tools))
        else:
            for wpt in wp.tools:
                tool = db.get(Tool, wpt.tool_id)
                if tool and tool.deleted_at is None and tool.is_active:
                    db.add(
                        ProjectPhaseTool(
                            phase_id=pp.id,
                            tool_id=wpt.tool_id,
                            usage_status="unused",
                            was_used=False,
                        )
                    )

        for item in wp.checklist_items:
            if item.deleted_at:
                continue
            db.add(
                Task(
                    project_id=project.id,
                    phase_id=pp.id,
                    title=item.title_en,
                    description=item.description_en,
                    assignee_id=assignee,
                    status="pending",
                    source_checklist_item_id=item.id,
                    is_mandatory=item.is_mandatory,
                )
            )

    _schedule_phases(created, project.start_date, project.due_date)


def create_project(db: Session, data: ProjectCreate, creator_id: int) -> Project:
    client_name = data.client_name or data.client
    members = list(data.members)
    if data.member_ids:
        existing = {m.user_id for m in members}
        for mid in data.member_ids:
            if mid not in existing:
                members.append(ProjectMemberIn(user_id=int(mid)))

    phase_assignees = dict(data.phase_assignees or {})
    selected_phase_ids: list[int] = list(getattr(data, "selected_phase_ids", None) or [])
    phase_weights: dict[int, float] = dict(getattr(data, "phase_weights", None) or {})
    phase_tool_ids: dict[int, list[int]] = {}

    if data.phase_assignments:
        for item in data.phase_assignments:
            wp_id = item.get("workflow_phase_id") or item.get("phase_id")
            assignee = item.get("assignee_id")
            weight = item.get("weight_percent")
            selected = item.get("selected", True)
            tool_ids = item.get("tool_ids")
            if wp_id and selected is not False:
                if int(wp_id) not in selected_phase_ids:
                    selected_phase_ids.append(int(wp_id))
            if wp_id and assignee:
                phase_assignees[int(wp_id)] = int(assignee)
            if wp_id and weight is not None and weight != "":
                try:
                    phase_weights[int(wp_id)] = float(weight)
                except (TypeError, ValueError):
                    pass
            if wp_id and tool_ids is not None:
                try:
                    phase_tool_ids[int(wp_id)] = [int(t) for t in tool_ids if t not in (None, "")]
                except (TypeError, ValueError):
                    phase_tool_ids[int(wp_id)] = []

    project = Project(
        name=data.name,
        description=data.description,
        project_type_id=int(data.project_type_id) if data.project_type_id else None,
        status=data.status,
        priority=data.priority,
        owner_id=data.owner_id or creator_id,
        client_name=client_name,
        business_unit=data.business_unit,
        start_date=data.start_date,
        due_date=data.due_date,
        workflow_id=int(data.workflow_id) if data.workflow_id else None,
        scope_in=data.scope_in,
        scope_out=data.scope_out,
        rules_of_engagement=data.rules_of_engagement,
        environment=data.environment,
        tags=data.tags if isinstance(data.tags, str) else None,
    )
    db.add(project)
    db.flush()

    for mid in members:
        db.add(
            ProjectMember(
                project_id=project.id,
                user_id=mid.user_id,
                role_label=mid.role_label,
            )
        )
    member_user_ids = {m.user_id for m in members}
    if project.owner_id and project.owner_id not in member_user_ids:
        db.add(
            ProjectMember(
                project_id=project.id, user_id=project.owner_id, role_label="owner"
            )
        )
        member_user_ids.add(project.owner_id)

    # Phase assignees are part of the project team
    for uid in phase_assignees.values():
        if uid and int(uid) not in member_user_ids:
            db.add(
                ProjectMember(
                    project_id=project.id, user_id=int(uid), role_label="member"
                )
            )
            member_user_ids.add(int(uid))

    if data.workflow_id:
        workflow = (
            db.query(Workflow)
            .filter(Workflow.id == data.workflow_id, Workflow.deleted_at.is_(None))
            .first()
        )
        if workflow:
            if data.phase_assignments and not selected_phase_ids:
                all_wp = (
                    db.query(WorkflowPhase)
                    .filter(
                        WorkflowPhase.workflow_id == workflow.id,
                        WorkflowPhase.deleted_at.is_(None),
                        WorkflowPhase.enabled.is_(True),
                    )
                    .order_by(WorkflowPhase.sort_order)
                    .all()
                )
                by_order = {p.sort_order: p.id for p in all_wp}
                for item in data.phase_assignments:
                    if item.get("selected") is False:
                        continue
                    wp_id = item.get("workflow_phase_id") or item.get("phase_id")
                    if not wp_id and "phase_order" in item:
                        wp_id = by_order.get(int(item["phase_order"]))
                    if wp_id:
                        selected_phase_ids.append(int(wp_id))
                        if item.get("assignee_id"):
                            phase_assignees[int(wp_id)] = int(item["assignee_id"])
                        if item.get("weight_percent") not in (None, ""):
                            phase_weights[int(wp_id)] = float(item["weight_percent"])
                        if item.get("tool_ids") is not None:
                            phase_tool_ids[int(wp_id)] = [
                                int(t) for t in item["tool_ids"] if t not in (None, "")
                            ]

            if not selected_phase_ids:
                selected_phase_ids = [
                    p.id
                    for p in db.query(WorkflowPhase)
                    .filter(
                        WorkflowPhase.workflow_id == workflow.id,
                        WorkflowPhase.deleted_at.is_(None),
                        WorkflowPhase.enabled.is_(True),
                    )
                    .all()
                ]

            snapshot_workflow_to_project(
                db,
                project,
                workflow,
                phase_assignees=phase_assignees,
                selected_phase_ids=selected_phase_ids,
                phase_weights=phase_weights,
                phase_tool_ids=phase_tool_ids,
            )

    # Ensure every phase assignee is recorded as a project member
    db.flush()
    existing_member_ids = {
        m.user_id
        for m in db.query(ProjectMember).filter(ProjectMember.project_id == project.id).all()
    }
    for ph in (
        db.query(ProjectPhase)
        .filter(ProjectPhase.project_id == project.id, ProjectPhase.deleted_at.is_(None))
        .all()
    ):
        if ph.assignee_id and ph.assignee_id not in existing_member_ids:
            db.add(
                ProjectMember(
                    project_id=project.id,
                    user_id=ph.assignee_id,
                    role_label="member",
                )
            )
            existing_member_ids.add(ph.assignee_id)

    # Notify phase assignees (exclude project creator handled by caller via exclude)
    from app.services.notifications import notify_user

    for ph in (
        db.query(ProjectPhase)
        .filter(ProjectPhase.project_id == project.id, ProjectPhase.deleted_at.is_(None))
        .all()
    ):
        if ph.assignee_id and ph.assignee_id != creator_id:
            notify_user(
                db,
                ph.assignee_id,
                type="phase_assigned",
                title_en=f"Phase assigned: {ph.name_en}",
                title_ar=f"تم إسناد مرحلة: {ph.name_ar or ph.name_en}",
                body_en=f"You were assigned to a phase on project «{project.name}».",
                body_ar=f"تم إسنادك إلى مرحلة في المشروع «{project.name}».",
                entity_type="project_phase",
                entity_id=ph.id,
            )

    return project


def apply_project_update(db: Session, project: Project, data: ProjectUpdate) -> None:
    """Apply metadata + optional member/phase updates."""
    payload = data.model_dump(exclude_unset=True)
    phase_updates = payload.pop("phase_updates", None) or []
    member_ids = payload.pop("member_ids", None)

    for k, v in payload.items():
        setattr(project, k, v)

    member_user_ids: set[int] = {
        m.user_id
        for m in db.query(ProjectMember).filter(ProjectMember.project_id == project.id).all()
    }

    if member_ids is not None:
        wanted = {int(x) for x in member_ids}
        existing_rows = {
            m.user_id: m
            for m in db.query(ProjectMember).filter(ProjectMember.project_id == project.id).all()
        }
        for uid in wanted:
            if uid not in existing_rows:
                db.add(ProjectMember(project_id=project.id, user_id=uid, role_label="member"))
                member_user_ids.add(uid)
        for uid, row in existing_rows.items():
            if uid not in wanted and row.role_label != "owner":
                db.delete(row)
                member_user_ids.discard(uid)
            else:
                member_user_ids.add(uid)

    reschedule = False
    for item in phase_updates:
        phase_id = item.get("phase_id") or item.get("id")
        if not phase_id:
            continue
        phase = (
            db.query(ProjectPhase)
            .filter(
                ProjectPhase.id == int(phase_id),
                ProjectPhase.project_id == project.id,
                ProjectPhase.deleted_at.is_(None),
            )
            .first()
        )
        if not phase:
            continue
        if item.get("weight_percent") is not None and item.get("weight_percent") != "":
            phase.weight_percent = float(item["weight_percent"])
            reschedule = True
        if "assignee_id" in item:
            aid = item.get("assignee_id")
            prev_assignee = phase.assignee_id
            phase.assignee_id = int(aid) if aid not in (None, "") else None
            if phase.assignee_id and phase.assignee_id not in member_user_ids:
                db.add(
                    ProjectMember(
                        project_id=project.id,
                        user_id=phase.assignee_id,
                        role_label="member",
                    )
                )
                member_user_ids.add(phase.assignee_id)
            if (
                phase.assignee_id
                and phase.assignee_id != prev_assignee
            ):
                from app.services.notifications import notify_user

                notify_user(
                    db,
                    phase.assignee_id,
                    type="phase_assigned",
                    title_en=f"Phase assigned: {phase.name_en}",
                    title_ar=f"تم إسناد مرحلة: {phase.name_ar or phase.name_en}",
                    body_en="You were assigned to a project phase.",
                    body_ar="تم إسنادك إلى مرحلة في المشروع.",
                    entity_type="project_phase",
                    entity_id=phase.id,
                )
        if item.get("planned_start"):
            phase.planned_start = (
                item["planned_start"]
                if hasattr(item["planned_start"], "year")
                else date.fromisoformat(str(item["planned_start"])[:10])
            )
        if item.get("planned_end"):
            phase.planned_end = (
                item["planned_end"]
                if hasattr(item["planned_end"], "year")
                else date.fromisoformat(str(item["planned_end"])[:10])
            )
        if "tool_ids" in item and item["tool_ids"] is not None:
            replace_phase_tools(db, phase.id, [int(t) for t in item["tool_ids"]])

    if reschedule or ("start_date" in payload or "due_date" in payload):
        phases = (
            db.query(ProjectPhase)
            .filter(ProjectPhase.project_id == project.id, ProjectPhase.deleted_at.is_(None))
            .order_by(ProjectPhase.sort_order)
            .all()
        )
        explicit_dates = any(
            item.get("planned_start") or item.get("planned_end") for item in phase_updates
        )
        if phases and not explicit_dates:
            _schedule_phases(phases, project.start_date, project.due_date)


def compute_project_progress(db: Session, project_id: int) -> float:
    """Weighted progress by phase weight_percent (fallback: duration hours)."""
    phases = (
        db.query(ProjectPhase)
        .filter(ProjectPhase.project_id == project_id, ProjectPhase.deleted_at.is_(None))
        .all()
    )
    if not phases:
        return 0.0

    completed_codes = {"completed", "skipped"}
    status_map: dict[int, str] = {}
    for st in db.query(PhaseStatus).all():
        status_map[st.id] = st.code

    total_weight = 0.0
    done_weight = 0.0
    for ph in phases:
        w = float(ph.weight_percent or ph.estimated_duration_hours or 1.0)
        total_weight += w
        code = status_map.get(ph.status_id or -1, "")
        if code in completed_codes:
            done_weight += w

    if total_weight <= 0:
        return 0.0
    return round(100.0 * done_weight / total_weight, 1)


VALID_PHASE_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"in_progress", "completed", "skipped"},
    "in_progress": {"blocked", "completed", "pending"},
    "blocked": {"in_progress", "skipped", "completed"},
    "completed": set(),
    "skipped": set(),
}


def validate_phase_transition(
    db: Session, current_status_id: int | None, new_status_id: int, reason: str | None
) -> PhaseStatus:
    new_st = db.get(PhaseStatus, new_status_id)
    if not new_st:
        from app.core.errors import AppError

        raise AppError("invalid_status", "Unknown phase status", 400)

    if current_status_id:
        cur = db.get(PhaseStatus, current_status_id)
        if cur:
            allowed = VALID_PHASE_TRANSITIONS.get(cur.code, set())
            if new_st.code not in allowed and new_st.code != cur.code:
                from app.core.errors import AppError

                raise AppError(
                    "invalid_transition",
                    f"Cannot transition from {cur.code} to {new_st.code}",
                    400,
                )

    if new_st.requires_reason and not reason:
        from app.core.errors import AppError

        raise AppError("reason_required", "This status requires a reason", 400)

    return new_st
