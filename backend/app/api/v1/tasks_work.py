"""Tasks, my-work, and team workload."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbSession, require_auth_csrf, require_permissions
from app.core.errors import AppError
from app.core.rbac import has_permission
from app.models.identity import User
from app.models.projects import ProjectPhase, Task, TaskComment, TimeEntry
from app.models.security_data import Finding
from app.schemas import TaskCommentCreate, TaskCreate, TaskOut, TaskUpdate, TimeEntryCreate
from app.schemas.common import Paginated
from app.services.access import assert_project_access, assert_task_access, user_project_ids
from app.services.audit import write_audit

router = APIRouter(tags=["tasks", "my-work", "team"])
AuthUser = Annotated[User, Depends(require_auth_csrf)]


def _task_out(db, task: Task) -> TaskOut:
    out = TaskOut.model_validate(task)
    if task.assignee_id:
        u = db.get(User, task.assignee_id)
        if u:
            out.assignee = {"id": u.id, "full_name": u.full_name, "username": u.username}
    assigned_by_id = getattr(task, "assigned_by_id", None)
    if assigned_by_id:
        assigner = db.get(User, assigned_by_id)
        if assigner:
            out.assigned_by = {
                "id": assigner.id,
                "full_name": assigner.full_name,
                "username": assigner.username,
            }
    from app.models.projects import Project

    proj = db.get(Project, task.project_id)
    if proj:
        out.project = {"id": proj.id, "name": proj.name}
    return out


@router.get("/tasks", response_model=Paginated[TaskOut])
def list_tasks(
    db: DbSession,
    user: CurrentUser,
    project_id: int | None = None,
    assignee_id: int | None = None,
    page: int = 1,
    page_size: int = 50,
) -> Paginated[TaskOut]:
    q = db.query(Task).filter(Task.deleted_at.is_(None))
    allowed = user_project_ids(db, user)
    if allowed is not None:
        q = q.filter(Task.project_id.in_(allowed or {-1}))
    if project_id:
        assert_project_access(db, user, project_id)
        q = q.filter(Task.project_id == project_id)
    if assignee_id:
        q = q.filter(Task.assignee_id == assignee_id)
    total = q.count()
    rows = q.order_by(Task.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Paginated(
        items=[_task_out(db, t) for t in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(
    request: Request,
    body: TaskCreate,
    db: DbSession,
    user: User = Depends(require_permissions("task.manage", "admin.all")),
) -> TaskOut:
    assert_project_access(db, user, body.project_id)
    payload = body.model_dump()
    task = Task(**payload)
    if task.assignee_id:
        task.assigned_by_id = user.id
    db.add(task)
    db.flush()
    write_audit(
        db,
        action="task.create",
        user_id=user.id,
        entity_type="task",
        entity_id=task.id,
        request=request,
    )
    if task.assignee_id and task.assignee_id != user.id:
        from app.services.notifications import notify_user

        notify_user(
            db,
            task.assignee_id,
            type="task_assigned",
            title_en=f"New task assigned: {task.title}",
            title_ar=f"مهمة جديدة مسندة: {task.title}",
            body_en=f"{user.full_name} assigned you a task.",
            body_ar=f"أسند إليك {user.full_name} مهمة جديدة.",
            entity_type="task",
            entity_id=task.id,
        )
    db.commit()
    db.refresh(task)
    return _task_out(db, task)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    request: Request,
    task_id: int,
    body: TaskUpdate,
    db: DbSession,
    user: AuthUser,
) -> TaskOut:
    task = assert_task_access(db, user, task_id)
    can_manage = has_permission(user, "task.manage") or has_permission(user, "admin.all")
    is_assignee = task.assignee_id == user.id
    can_own = (has_permission(user, "task.update_own") or is_assignee) and is_assignee
    if not (can_manage or can_own):
        raise AppError("forbidden", "Cannot update this task", 403)

    prev_assignee = task.assignee_id
    prev_status = (task.status or "").lower()
    data = body.model_dump(exclude_unset=True)

    # Assignees may only change status (and checklist_result); managers can edit all.
    if can_own and not can_manage:
        allowed = {"status", "checklist_result"}
        data = {k: v for k, v in data.items() if k in allowed}

    for k, v in data.items():
        setattr(task, k, v)

    new_assignee = task.assignee_id
    if can_manage and new_assignee and new_assignee != prev_assignee:
        task.assigned_by_id = user.id

    write_audit(
        db,
        action="task.update",
        user_id=user.id,
        entity_type="task",
        entity_id=task.id,
        after=data,
        request=request,
    )

    from app.services.notifications import notify_admins_and_leads, notify_user

    if (
        can_manage
        and new_assignee
        and new_assignee != prev_assignee
        and new_assignee != user.id
    ):
        notify_user(
            db,
            new_assignee,
            type="task_assigned",
            title_en=f"Task assigned: {task.title}",
            title_ar=f"تم إسناد مهمة: {task.title}",
            body_en=f"{user.full_name} assigned you a task.",
            body_ar=f"أسند إليك {user.full_name} مهمة.",
            entity_type="task",
            entity_id=task.id,
        )

    new_status = (task.status or "").lower()
    if new_status == "completed" and prev_status != "completed":
        extra = set()
        if getattr(task, "assigned_by_id", None):
            extra.add(int(task.assigned_by_id))
        notify_admins_and_leads(
            db,
            type="task_completed",
            title_en=f"Task completed: {task.title}",
            title_ar=f"اكتملت المهمة: {task.title}",
            body_en=f"{user.full_name} marked the task as completed.",
            body_ar=f"حدّد {user.full_name} حالة المهمة كمكتملة.",
            entity_type="task",
            entity_id=task.id,
            exclude_user_id=user.id,
            extra_user_ids=extra,
        )

    db.commit()
    db.refresh(task)
    return _task_out(db, task)


@router.delete("/tasks/{task_id}")
def delete_task(
    request: Request,
    task_id: int,
    db: DbSession,
    user: User = Depends(require_permissions("task.manage", "admin.all")),
) -> dict:
    from app.core.mixins import utcnow

    task = assert_task_access(db, user, task_id)
    task.deleted_at = utcnow()
    write_audit(
        db,
        action="task.delete",
        user_id=user.id,
        entity_type="task",
        entity_id=task.id,
        request=request,
    )
    db.commit()
    return {"detail": "Deleted", "code": "ok"}


@router.post("/tasks/{task_id}/comments", status_code=201)
def add_comment(
    request: Request,
    task_id: int,
    body: TaskCommentCreate,
    db: DbSession,
    user: AuthUser,
) -> dict:
    assert_task_access(db, user, task_id)
    c = TaskComment(task_id=task_id, author_id=user.id, body=body.body)
    db.add(c)
    db.commit()
    return {"id": c.id, "detail": "Created", "code": "ok"}


@router.post("/time-entries", status_code=201)
def log_time(
    body: TimeEntryCreate,
    db: DbSession,
    user: AuthUser,
) -> dict:
    assert_task_access(db, user, body.task_id)
    entry = TimeEntry(
        task_id=body.task_id,
        user_id=user.id,
        hours=body.hours,
        work_date=body.work_date,
        note=body.note,
    )
    db.add(entry)
    db.commit()
    return {"id": entry.id, "detail": "Logged", "code": "ok"}


@router.get("/my-work")
def my_work(db: DbSession, user: CurrentUser) -> dict:
    from app.models.lookups import PhaseStatus

    tasks = (
        db.query(Task)
        .filter(
            Task.assignee_id == user.id,
            Task.deleted_at.is_(None),
            Task.status.notin_(["cancelled"]),
        )
        .order_by(Task.due_date.nulls_last())
        .all()
    )
    phases = (
        db.query(ProjectPhase)
        .filter(ProjectPhase.assignee_id == user.id, ProjectPhase.deleted_at.is_(None))
        .all()
    )
    findings = (
        db.query(Finding)
        .filter(Finding.assignee_id == user.id, Finding.deleted_at.is_(None))
        .all()
    )
    today = date.today()
    status_map = {s.id: s.code for s in db.query(PhaseStatus).all()}
    task_items = [_task_out(db, t).model_dump() for t in tasks]
    return {
        "tasks": task_items,
        "phases": [
            {
                "id": p.id,
                "project_id": p.project_id,
                "name_en": p.name_en,
                "name_ar": p.name_ar,
                "status_id": p.status_id,
                "status": status_map.get(p.status_id or -1, "pending"),
                "planned_end": p.planned_end.isoformat() if p.planned_end else None,
                "overdue": bool(p.planned_end and p.planned_end < today),
            }
            for p in phases
        ],
        "findings": [
            {"id": f.id, "public_id": f.public_id, "title": f.title, "project_id": f.project_id}
            for f in findings
        ],
        "overdue_tasks": sum(
            1
            for t in tasks
            if t.due_date and t.due_date < today and t.status not in ("completed", "cancelled")
        ),
    }


@router.get("/team/workload")
def team_workload(
    db: DbSession,
    _: User = Depends(require_permissions("team.read", "project.manage", "admin.all")),
) -> list[dict]:
    users = db.query(User).filter(User.deleted_at.is_(None), User.is_active.is_(True)).all()
    today = date.today()
    result = []
    for u in users:
        open_tasks = (
            db.query(Task)
            .filter(
                Task.assignee_id == u.id,
                Task.deleted_at.is_(None),
                Task.status.notin_(["completed", "cancelled"]),
            )
            .all()
        )
        open_phases = (
            db.query(ProjectPhase)
            .filter(ProjectPhase.assignee_id == u.id, ProjectPhase.deleted_at.is_(None))
            .count()
        )
        open_findings = (
            db.query(Finding)
            .filter(Finding.assignee_id == u.id, Finding.deleted_at.is_(None))
            .count()
        )
        est = sum(t.estimated_hours or 0 for t in open_tasks)
        logged = (
            db.query(TimeEntry)
            .filter(TimeEntry.user_id == u.id)
            .all()
        )
        logged_hours = sum(e.hours for e in logged)
        result.append(
            {
                "user_id": u.id,
                "full_name": u.full_name,
                "open_tasks": len(open_tasks),
                "open_phases": open_phases,
                "open_findings": open_findings,
                "overdue_tasks": sum(
                    1 for t in open_tasks if t.due_date and t.due_date < today
                ),
                "estimated_hours": est,
                "logged_hours": logged_hours,
            }
        )
    return result
