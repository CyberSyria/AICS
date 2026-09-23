"""Notifications, audit logs, search, and dashboard."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import or_

from app.core.deps import CurrentUser, DbSession, require_auth_csrf, require_permissions
from app.core.errors import AppError
from app.core.mixins import utcnow
from app.models.identity import User
from app.models.lookups import SeverityLevel
from app.models.platform import AuditLog, Notification
from app.models.projects import Project, ProjectPhase, Task
from app.models.security_data import Asset, Finding, Tool
from app.schemas import AuditLogOut, DashboardOut, NotificationOut, SearchResult
from app.schemas.common import Paginated
from app.services.access import user_project_ids

router = APIRouter(tags=["notifications", "audit-logs", "search", "dashboard"])
AuthUser = Annotated[User, Depends(require_auth_csrf)]


@router.get("/notifications", response_model=Paginated[NotificationOut])
def list_notifications(
    db: DbSession,
    user: CurrentUser,
    unread_only: bool = False,
    page: int = 1,
    page_size: int = 50,
) -> Paginated[NotificationOut]:
    q = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    total = q.count()
    rows = q.order_by(Notification.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return Paginated(
        items=[NotificationOut.model_validate(n) for n in rows],
        page=page,
        page_size=page_size,
        total=total,
    )


@router.get("/notifications/unread-count")
def unread_count(db: DbSession, user: CurrentUser) -> dict:
    count = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read.is_(False))
        .count()
    )
    return {"count": count}


@router.post("/notifications/{notification_id}/read")
def mark_read(
    notification_id: int,
    db: DbSession,
    user: AuthUser,
) -> dict:
    n = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user.id)
        .first()
    )
    if not n:
        raise AppError("not_found", "Notification not found", 404)
    n.is_read = True
    n.read_at = utcnow()
    db.commit()
    return {"detail": "Marked read", "code": "ok"}


@router.post("/notifications/read-all")
def mark_all_read(db: DbSession, user: AuthUser) -> dict:
    db.query(Notification).filter(
        Notification.user_id == user.id, Notification.is_read.is_(False)
    ).update({"is_read": True, "read_at": utcnow()})
    db.commit()
    return {"detail": "All marked read", "code": "ok"}


@router.get("/audit-logs", response_model=Paginated[AuditLogOut])
def list_audit_logs(
    db: DbSession,
    page: int = 1,
    page_size: int = 50,
    action: str | None = None,
    entity_type: str | None = None,
    q: str | None = None,
    _: User = Depends(require_permissions("audit.read", "admin.all")),
) -> Paginated[AuditLogOut]:
    from sqlalchemy import or_

    from app.models.identity import User as UserModel
    from app.schemas import UserBrief

    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                AuditLog.action.ilike(term),
                AuditLog.entity_type.ilike(term),
                AuditLog.before_summary.ilike(term),
                AuditLog.after_summary.ilike(term),
                AuditLog.ip_address.ilike(term),
            )
        )
    total = query.count()
    rows = query.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items: list[AuditLogOut] = []
    for a in rows:
        user = db.get(UserModel, a.user_id) if a.user_id else None
        summary = a.after_summary or a.before_summary
        items.append(
            AuditLogOut(
                id=a.id,
                user_id=a.user_id,
                user=UserBrief(
                    id=user.id,
                    full_name=user.full_name,
                    username=user.username,
                    email=user.email,
                )
                if user
                else None,
                action=a.action,
                entity_type=a.entity_type,
                entity=a.entity_type,
                entity_id=a.entity_id,
                ip_address=a.ip_address,
                before_summary=a.before_summary,
                after_summary=a.after_summary,
                summary=summary,
                request_id=a.request_id,
                created_at=a.created_at,
            )
        )
    return Paginated(items=items, page=page, page_size=page_size, total=total)


@router.get("/search", response_model=list[SearchResult])
def search(
    q: str,
    db: DbSession,
    user: CurrentUser,
    limit: int = 30,
) -> list[SearchResult]:
    if not q or len(q.strip()) < 2:
        return []
    term = f"%{q.strip()}%"
    allowed = user_project_ids(db, user)
    results: list[SearchResult] = []

    pq = db.query(Project).filter(Project.deleted_at.is_(None), Project.name.ilike(term))
    if allowed is not None:
        pq = pq.filter(Project.id.in_(allowed or {-1}))
    for p in pq.limit(limit).all():
        results.append(SearchResult(entity_type="project", entity_id=p.id, title=p.name))

    fq = db.query(Finding).filter(
        Finding.deleted_at.is_(None),
        or_(Finding.title.ilike(term), Finding.public_id.ilike(term)),
    )
    if allowed is not None:
        fq = fq.filter(Finding.project_id.in_(allowed or {-1}))
    for f in fq.limit(limit).all():
        results.append(
            SearchResult(
                entity_type="finding",
                entity_id=f.id,
                title=f"{f.public_id} — {f.title}",
            )
        )

    aq = db.query(Asset).filter(
        Asset.deleted_at.is_(None),
        or_(Asset.name.ilike(term), Asset.value.ilike(term)),
    )
    if allowed is not None:
        aq = aq.filter(Asset.project_id.in_(allowed or {-1}))
    for a in aq.limit(limit).all():
        results.append(
            SearchResult(entity_type="asset", entity_id=a.id, title=a.name, subtitle=a.value)
        )

    for t in (
        db.query(Tool)
        .filter(
            Tool.deleted_at.is_(None),
            or_(Tool.name_en.ilike(term), Tool.name_ar.ilike(term)),
        )
        .limit(limit)
        .all()
    ):
        results.append(SearchResult(entity_type="tool", entity_id=t.id, title=t.name_en))

    if has_user_search(user):
        for u in (
            db.query(User)
            .filter(
                User.deleted_at.is_(None),
                or_(User.full_name.ilike(term), User.email.ilike(term)),
            )
            .limit(limit)
            .all()
        ):
            results.append(
                SearchResult(entity_type="user", entity_id=u.id, title=u.full_name, subtitle=u.email)
            )

    return results[:limit]


def has_user_search(user: User) -> bool:
    from app.core.rbac import has_permission

    return has_permission(user, "user.read") or has_permission(user, "admin.all")


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: DbSession, user: CurrentUser) -> DashboardOut:
    from collections import Counter

    from app.models.identity import User as UserModel
    from app.services.projects import compute_project_progress

    allowed = user_project_ids(db, user)
    pq = db.query(Project).filter(Project.deleted_at.is_(None))
    if allowed is not None:
        pq = pq.filter(Project.id.in_(allowed or {-1}))
    projects = pq.all()
    project_ids = [p.id for p in projects]

    fq = db.query(Finding).filter(Finding.deleted_at.is_(None))
    if project_ids:
        fq = fq.filter(Finding.project_id.in_(project_ids))
    elif allowed is not None:
        fq = fq.filter(Finding.id == -1)

    findings = fq.order_by(Finding.id.desc()).all()
    severities = {s.id: s for s in db.query(SeverityLevel).all()}
    by_sev_counts: Counter[int] = Counter()
    for f in findings:
        if f.severity_id:
            by_sev_counts[f.severity_id] += 1
    open_findings_by_severity = [
        {
            "name": severities[sid].name_en,
            "name_ar": severities[sid].name_ar,
            "count": count,
            "color": severities[sid].color_token,
        }
        for sid, count in by_sev_counts.items()
        if sid in severities
    ]

    today = date.today()
    overdue_findings = sum(1 for f in findings if f.due_date and f.due_date < today)

    tq = db.query(Task).filter(Task.deleted_at.is_(None), Task.status.notin_(["completed", "cancelled"]))
    if project_ids:
        tq = tq.filter(Task.project_id.in_(project_ids))
    elif allowed is not None:
        tq = tq.filter(Task.id == -1)
    tasks = tq.all()
    overdue_tasks = sum(1 for t in tasks if t.due_date and t.due_date < today)

    phq = db.query(ProjectPhase).filter(ProjectPhase.deleted_at.is_(None))
    if project_ids:
        phq = phq.filter(ProjectPhase.project_id.in_(project_ids))
    elif allowed is not None:
        phq = phq.filter(ProjectPhase.id == -1)
    phases = phq.all()
    overdue_phases = sum(1 for p in phases if p.planned_end and p.planned_end < today)

    status_counts = Counter(p.status or "unknown" for p in projects)
    project_status_distribution = [
        {"status": status, "count": count} for status, count in status_counts.items()
    ]

    my_open_tasks = sum(1 for t in tasks if t.assignee_id == user.id)
    my_open_phases = sum(1 for p in phases if p.assignee_id == user.id)
    my_overdue = sum(
        1
        for t in tasks
        if t.assignee_id == user.id and t.due_date and t.due_date < today
    ) + sum(
        1
        for p in phases
        if p.assignee_id == user.id and p.planned_end and p.planned_end < today
    )

    # Team workload (top users by open tasks)
    assignee_ids = {t.assignee_id for t in tasks if t.assignee_id} | {
        p.assignee_id for p in phases if p.assignee_id
    }
    users_by_id = {
        u.id: u
        for u in db.query(UserModel).filter(UserModel.id.in_(assignee_ids or {-1})).all()
    }
    team_workload = []
    for uid in assignee_ids:
        u = users_by_id.get(uid)
        if not u:
            continue
        open_t = sum(1 for t in tasks if t.assignee_id == uid)
        overdue_u = sum(
            1 for t in tasks if t.assignee_id == uid and t.due_date and t.due_date < today
        )
        team_workload.append(
            {
                "user_id": uid,
                "name": u.full_name or u.username,
                "open_tasks": open_t,
                "overdue": overdue_u,
            }
        )
    team_workload.sort(key=lambda x: x["open_tasks"], reverse=True)

    assessment_progress = [
        {
            "project_id": p.id,
            "name": p.name,
            "progress": compute_project_progress(db, p.id),
        }
        for p in projects[:10]
    ]

    # Findings count per project (for chart + hover details)
    findings_by_project: list[dict] = []
    for p in projects:
        proj_findings = [f for f in findings if f.project_id == p.id]
        if not proj_findings and not projects:
            continue
        sev_counts: Counter[str] = Counter()
        by_severity: list[dict] = []
        for f in proj_findings:
            sev = severities.get(f.severity_id) if f.severity_id else None
            code = (sev.code if sev else "unknown").lower()
            sev_counts[code] += 1
        for code, count in sev_counts.most_common():
            # resolve display names
            sev_obj = next((s for s in severities.values() if s.code.lower() == code), None)
            by_severity.append(
                {
                    "code": code,
                    "name": sev_obj.name_en if sev_obj else code,
                    "name_ar": sev_obj.name_ar if sev_obj else code,
                    "count": count,
                    "color": sev_obj.color_token if sev_obj else None,
                }
            )
        findings_by_project.append(
            {
                "project_id": p.id,
                "name": p.name,
                "total": len(proj_findings),
                "by_severity": by_severity,
            }
        )
    findings_by_project.sort(key=lambda x: x["total"], reverse=True)

    recent_findings = []
    for f in findings[:8]:
        sev = severities.get(f.severity_id) if f.severity_id else None
        recent_findings.append(
            {
                "id": f.id,
                "human_id": f.public_id,
                "public_id": f.public_id,
                "title": f.title,
                "severity": {
                    "name_en": sev.name_en if sev else None,
                    "name_ar": sev.name_ar if sev else None,
                    "color_token": sev.color_token if sev else None,
                }
                if sev
                else None,
            }
        )

    recent = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(15).all()
    upcoming = []
    for t in sorted([t for t in tasks if t.due_date], key=lambda x: x.due_date)[:10]:
        upcoming.append(
            {
                "type": "task",
                "id": t.id,
                "title": t.title,
                "due_date": t.due_date.isoformat(),
            }
        )

    return DashboardOut(
        total_projects=len(projects),
        active_projects=sum(1 for p in projects if p.status in {"active", "in_progress"}),
        completed_projects=sum(1 for p in projects if p.status == "completed"),
        open_findings_by_severity=open_findings_by_severity,
        overdue_findings=overdue_findings,
        overdue_tasks=overdue_tasks,
        overdue_phases=overdue_phases,
        my_open_tasks=my_open_tasks,
        my_open_findings=sum(1 for f in findings if f.assignee_id == user.id),
        my_work_summary={
            "open_tasks": my_open_tasks,
            "open_phases": my_open_phases,
            "overdue": my_overdue,
        },
        recent_activity=[
            {
                "id": a.id,
                "action": a.action,
                "entity_type": a.entity_type,
                "entity_id": a.entity_id,
                "entity": a.entity_type,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "user": None,
            }
            for a in recent
        ],
        upcoming_deadlines=upcoming,
        project_status_distribution=project_status_distribution,
        findings_by_project=findings_by_project[:15],
        team_workload=team_workload[:12],
        assessment_progress=assessment_progress,
        recent_findings=recent_findings,
    )
