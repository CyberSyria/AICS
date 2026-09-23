"""Finding ID sequence (SEC-0001) and finding business logic."""

from __future__ import annotations

from datetime import date, timedelta

import bleach
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.mixins import utcnow
from app.models.lookups import FindingStatus, SeverityLevel
from app.models.security_data import Finding, FindingHistory, FindingIdCounter
from app.schemas import FindingCreate, FindingUpdate


ALLOWED_TAGS = [
    "p", "br", "strong", "em", "ul", "ol", "li", "code", "pre", "a", "blockquote", "h1",
    "h2", "h3",
]
ALLOWED_ATTRS = {"a": ["href", "title", "rel"]}


def sanitize_text(value: str | None) -> str | None:
    if value is None:
        return None
    # Strip raw HTML; markdown rendered later — keep plain-ish safe text
    return bleach.clean(value, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)


def next_finding_public_id(db: Session) -> str:
    """Allocate next SEC-#### ID. Never reuse, even after soft delete."""
    counter = db.query(FindingIdCounter).first()
    if counter is None:
        counter = FindingIdCounter(next_value=1)
        db.add(counter)
        db.flush()

    # Best-effort row lock on PostgreSQL; SQLite ignores / no-ops safely via plain query
    try:
        locked = db.execute(select(FindingIdCounter).with_for_update()).scalar_one_or_none()
        if locked:
            counter = locked
    except Exception:
        pass

    value = counter.next_value
    counter.next_value = value + 1
    db.flush()
    return f"SEC-{value:04d}"


def _suggest_due_date(db: Session, severity_id: int | None) -> date | None:
    if not severity_id:
        return None
    sev = db.get(SeverityLevel, severity_id)
    if sev and sev.sla_days:
        return date.today() + timedelta(days=sev.sla_days)
    return None


def create_finding(db: Session, data: FindingCreate, reporter_id: int) -> Finding:
    public_id = next_finding_public_id(db)
    status_id = data.status_id
    if status_id is None:
        review_status = (
            db.query(FindingStatus)
            .filter(FindingStatus.code == "in_review", FindingStatus.deleted_at.is_(None))
            .first()
        )
        if not review_status:
            review_status = (
                db.query(FindingStatus)
                .filter(FindingStatus.code == "open", FindingStatus.deleted_at.is_(None))
                .first()
            )
        status_id = review_status.id if review_status else None

    due = data.due_date or _suggest_due_date(db, data.severity_id)

    finding = Finding(
        public_id=public_id,
        title=sanitize_text(data.title) or data.title,
        description=sanitize_text(data.description),
        severity_id=data.severity_id,
        status_id=status_id,
        project_id=data.project_id,
        asset_id=data.asset_id,
        phase_id=data.phase_id,
        tool_id=data.tool_id,
        assignee_id=data.assignee_id,
        reporter_id=reporter_id,
        affected_component=data.affected_component,
        impact=sanitize_text(data.impact),
        recommendation=sanitize_text(data.recommendation),
        reproduction_steps=sanitize_text(data.reproduction_steps),
        references=sanitize_text(data.references),
        cve=data.cve,
        cwe=data.cwe,
        cvss_score=data.cvss_score,
        cvss_vector=data.cvss_vector,
        owasp_mapping=data.owasp_mapping,
        tags=data.tags,
        due_date=due,
        notes=sanitize_text(data.notes),
    )
    db.add(finding)
    db.flush()
    db.add(
        FindingHistory(
            finding_id=finding.id,
            user_id=reporter_id,
            field_name="created",
            old_value=None,
            new_value=public_id,
        )
    )
    return finding


def update_finding(
    db: Session, finding: Finding, data: FindingUpdate, user_id: int
) -> Finding:
    payload = data.model_dump(exclude_unset=True)
    text_fields = {
        "title",
        "description",
        "impact",
        "recommendation",
        "reproduction_steps",
        "references",
        "notes",
    }
    for field, new_val in payload.items():
        old_val = getattr(finding, field)
        if old_val == new_val:
            continue
        if field in text_fields and isinstance(new_val, str):
            new_val = sanitize_text(new_val)
        db.add(
            FindingHistory(
                finding_id=finding.id,
                user_id=user_id,
                field_name=field,
                old_value=str(old_val) if old_val is not None else None,
                new_value=str(new_val) if new_val is not None else None,
            )
        )
        setattr(finding, field, new_val)
    finding.updated_at = utcnow()
    return finding
