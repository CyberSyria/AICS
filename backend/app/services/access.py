"""Object-level access checks (IDOR prevention)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.rbac import has_permission
from app.models.identity import User
from app.models.projects import Project, ProjectMember, ProjectPhase, Task
from app.models.security_data import Evidence, Finding


def _is_admin_or_manager(user: User) -> bool:
    return has_permission(user, "admin.all") or has_permission(user, "project.manage")


def user_project_ids(db: Session, user: User) -> set[int] | None:
    """None means all projects; otherwise the set of accessible project IDs."""
    if _is_admin_or_manager(user) or has_permission(user, "project.manage"):
        return None
    member_ids = {
        m.project_id
        for m in db.query(ProjectMember).filter(ProjectMember.user_id == user.id).all()
    }
    owned = {
        p.id
        for p in db.query(Project.id)
        .filter(Project.owner_id == user.id, Project.deleted_at.is_(None))
        .all()
    }
    assigned_phases = {
        ph.project_id
        for ph in db.query(ProjectPhase.project_id)
        .filter(ProjectPhase.assignee_id == user.id, ProjectPhase.deleted_at.is_(None))
        .all()
    }
    assigned_tasks = {
        t.project_id
        for t in db.query(Task.project_id)
        .filter(Task.assignee_id == user.id, Task.deleted_at.is_(None))
        .all()
    }
    return member_ids | owned | assigned_phases | assigned_tasks


def assert_project_access(db: Session, user: User, project_id: int) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.deleted_at.is_(None))
        .first()
    )
    if not project:
        raise AppError("not_found", "Project not found", 404)
    allowed = user_project_ids(db, user)
    if allowed is not None and project_id not in allowed:
        raise AppError("forbidden", "No access to this project", 403)
    return project


def assert_finding_access(db: Session, user: User, finding_id: int) -> Finding:
    finding = (
        db.query(Finding)
        .filter(Finding.id == finding_id, Finding.deleted_at.is_(None))
        .first()
    )
    if not finding:
        raise AppError("not_found", "Finding not found", 404)
    assert_project_access(db, user, finding.project_id)
    return finding


def assert_evidence_access(db: Session, user: User, evidence_id: int) -> Evidence:
    evidence = (
        db.query(Evidence)
        .filter(Evidence.id == evidence_id, Evidence.deleted_at.is_(None))
        .first()
    )
    if not evidence:
        raise AppError("not_found", "Evidence not found", 404)
    assert_project_access(db, user, evidence.project_id)
    return evidence


def assert_task_access(db: Session, user: User, task_id: int) -> Task:
    task = db.query(Task).filter(Task.id == task_id, Task.deleted_at.is_(None)).first()
    if not task:
        raise AppError("not_found", "Task not found", 404)
    assert_project_access(db, user, task.project_id)
    return task


def can_update_finding(user: User, finding: Finding) -> bool:
    if has_permission(user, "finding.update") or has_permission(user, "admin.all"):
        return True
    if has_permission(user, "finding.update_own"):
        return finding.assignee_id == user.id or finding.reporter_id == user.id
    return False


def _is_phase_assignee(db: Session, user: User, phase_id: int, project_id: int) -> bool:
    phase = (
        db.query(ProjectPhase)
        .filter(
            ProjectPhase.id == phase_id,
            ProjectPhase.project_id == project_id,
            ProjectPhase.deleted_at.is_(None),
        )
        .first()
    )
    return bool(phase and phase.assignee_id == user.id)


def _is_task_assignee(db: Session, user: User, task_id: int, project_id: int) -> bool:
    task = (
        db.query(Task)
        .filter(Task.id == task_id, Task.project_id == project_id, Task.deleted_at.is_(None))
        .first()
    )
    return bool(task and task.assignee_id == user.id)


def can_upload_evidence(
    db: Session,
    user: User,
    project_id: int,
    *,
    phase_id: int | None = None,
    task_id: int | None = None,
    finding_id: int | None = None,
) -> bool:
    """Admins/managers may upload anywhere; others only on assigned phase/task."""
    if has_permission(user, "admin.all") or has_permission(user, "project.manage"):
        return True
    if not has_permission(user, "evidence.upload"):
        return False
    if task_id is not None:
        return _is_task_assignee(db, user, int(task_id), project_id)
    resolved_phase = phase_id
    if resolved_phase is None and finding_id is not None:
        finding = (
            db.query(Finding)
            .filter(Finding.id == int(finding_id), Finding.deleted_at.is_(None))
            .first()
        )
        if finding and finding.project_id == project_id:
            resolved_phase = finding.phase_id
    if resolved_phase is not None:
        return _is_phase_assignee(db, user, int(resolved_phase), project_id)
    return False


def assert_can_upload_evidence(
    db: Session,
    user: User,
    project_id: int,
    *,
    phase_id: int | None = None,
    task_id: int | None = None,
    finding_id: int | None = None,
) -> None:
    if not can_upload_evidence(
        db,
        user,
        project_id,
        phase_id=phase_id,
        task_id=task_id,
        finding_id=finding_id,
    ):
        raise AppError(
            "forbidden",
            "Only the assigned user can upload evidence for this phase/task",
            403,
        )


def can_create_finding_on(
    db: Session,
    user: User,
    project_id: int,
    *,
    phase_id: int | None = None,
) -> bool:
    """Managers/admins unrestricted; analysts only on their assigned phase."""
    if (
        has_permission(user, "admin.all")
        or has_permission(user, "project.manage")
        or has_permission(user, "finding.update")
    ):
        return True
    if not has_permission(user, "finding.create"):
        return False
    if phase_id is None:
        return False
    return _is_phase_assignee(db, user, int(phase_id), project_id)


def assert_can_create_finding(
    db: Session,
    user: User,
    project_id: int,
    *,
    phase_id: int | None = None,
) -> None:
    if not can_create_finding_on(db, user, project_id, phase_id=phase_id):
        raise AppError(
            "forbidden",
            "You can only add findings on phases assigned to you",
            403,
        )
