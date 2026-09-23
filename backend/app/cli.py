"""
CLI entrypoints:

  python -m app.cli seed
  python -m app.cli ensure-admin
  python -m app.cli create-admin --username admin --name "Admin" --password '...'
"""

from __future__ import annotations

import getpass
import sys

import click

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password, password_meets_policy
from app.models import *  # noqa: F401,F403 — register metadata
from app.models.identity import Role, User, UserPreferences
from app.seed import ensure_default_admin, seed_all


@click.group()
def cli() -> None:
    """Security Assessment Management Platform CLI."""


@cli.command("init-db")
def init_db() -> None:
    """Create all tables (dev convenience; prefer alembic upgrade head)."""
    Base.metadata.create_all(bind=engine)
    _ensure_columns()
    click.echo("Database tables created.")


@cli.command("seed")
def seed_cmd() -> None:
    """Seed roles, lookups, workflows, and default admin (admin / 1234)."""
    Base.metadata.create_all(bind=engine)
    _ensure_columns()
    db = SessionLocal()
    try:
        seed_all(db)
        click.echo("Seed completed (default admin: admin / 1234).")
    finally:
        db.close()


def _ensure_columns() -> None:
    """Add columns introduced after initial create_all (SQLite-friendly)."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    def add_col(table: str, column: str, ddl: str) -> None:
        if table not in tables:
            return
        cols = {c["name"] for c in inspector.get_columns(table)}
        if column not in cols:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
            click.echo(f"Added {table}.{column} column.")

    add_col("evidence", "task_id", "task_id INTEGER")
    add_col("project_phases", "weight_percent", "weight_percent FLOAT")
    add_col("project_phase_tools", "usage_status", "usage_status VARCHAR(32) DEFAULT 'unused'")
    add_col("tasks", "assigned_by_id", "assigned_by_id INTEGER")


@cli.command("ensure-admin")
def ensure_admin_cmd() -> None:
    """Create or reset the default admin user to username=admin password=1234."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if not db.query(Role).filter(Role.code == "admin").first():
            seed_all(db)
        else:
            ensure_default_admin(db)
            db.commit()
        click.echo("Default admin ready: username=admin password=1234")
    finally:
        db.close()


@cli.command("create-admin")
@click.option("--username", prompt=True)
@click.option("--name", "full_name", prompt="Full name")
@click.option("--password", default=None, help="If omitted, prompted securely")
@click.option("--email", default=None, help="Optional email")
def create_admin(username: str, full_name: str, password: str | None, email: str | None) -> None:
    """Create an admin user by username."""
    Base.metadata.create_all(bind=engine)
    if password is None:
        password = getpass.getpass("Password: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            click.echo("Passwords do not match.", err=True)
            sys.exit(1)

    ok, code = password_meets_policy(password)
    if not ok:
        click.echo(f"Password policy failed: {code}", err=True)
        sys.exit(1)

    db = SessionLocal()
    try:
        if not db.query(Role).filter(Role.code == "admin").first():
            seed_all(db)

        admin_role = db.query(Role).filter(Role.code == "admin").first()
        if not admin_role:
            click.echo("Admin role missing after seed.", err=True)
            sys.exit(1)

        username_n = username.lower().strip()
        existing = db.query(User).filter(User.username == username_n).first()
        if existing:
            click.echo(f"User {username_n} already exists (id={existing.id}).", err=True)
            sys.exit(1)

        user = User(
            username=username_n,
            email=email.lower().strip() if email else None,
            full_name=full_name,
            password_hash=hash_password(password),
            role_id=admin_role.id,
            is_active=True,
            must_change_password=False,
        )
        db.add(user)
        db.flush()
        db.add(UserPreferences(user_id=user.id, language="ar"))
        db.commit()
        click.echo(f"Admin created: {username_n} (id={user.id})")
    finally:
        db.close()


@cli.command("reset-roles")
def reset_roles_cmd() -> None:
    """Restore system role permissions (viewer/analyst/manager/admin) to defaults."""
    from app.services.rbac_sync import apply_system_role_permissions

    Base.metadata.create_all(bind=engine)
    _ensure_columns()
    db = SessionLocal()
    try:
        n = apply_system_role_permissions(db)
        db.commit()
        click.echo(f"System roles restored ({n} roles). Viewer can no longer create projects.")
    finally:
        db.close()


@cli.command("notify-overdue")
def notify_overdue() -> None:
    """Create in-app notifications for overdue / due-soon tasks/phases/findings."""
    from datetime import date, timedelta

    from app.models.lookups import PhaseStatus
    from app.models.platform import Notification
    from app.models.projects import ProjectPhase, Task
    from app.models.security_data import Finding

    db = SessionLocal()
    try:
        today = date.today()
        tomorrow = today + timedelta(days=1)
        created = 0
        completed_ids = {
            s.id
            for s in db.query(PhaseStatus).filter(PhaseStatus.code.in_(["completed", "skipped"])).all()
        }

        def already_notified(user_id: int, ntype: str, entity_type: str, entity_id: int) -> bool:
            return (
                db.query(Notification)
                .filter(
                    Notification.user_id == user_id,
                    Notification.type == ntype,
                    Notification.entity_type == entity_type,
                    Notification.entity_id == entity_id,
                )
                .first()
                is not None
            )

        for task in (
            db.query(Task)
            .filter(Task.due_date.isnot(None), Task.due_date < today, Task.deleted_at.is_(None))
            .filter(Task.status.notin_(["completed", "cancelled"]))
            .all()
        ):
            if task.assignee_id and not already_notified(task.assignee_id, "overdue_task", "task", task.id):
                db.add(
                    Notification(
                        user_id=task.assignee_id,
                        type="overdue_task",
                        title_en=f"Overdue task: {task.title}",
                        title_ar=f"مهمة متأخرة: {task.title}",
                        body_en="Please update status or request an extension.",
                        body_ar="يرجى تحديث الحالة أو طلب تمديد.",
                        entity_type="task",
                        entity_id=task.id,
                    )
                )
                created += 1

        for phase in (
            db.query(ProjectPhase)
            .filter(
                ProjectPhase.planned_end.isnot(None),
                ProjectPhase.planned_end < today,
                ProjectPhase.deleted_at.is_(None),
            )
            .all()
        ):
            if phase.status_id in completed_ids:
                continue
            if phase.assignee_id and not already_notified(
                phase.assignee_id, "overdue_phase", "project_phase", phase.id
            ):
                db.add(
                    Notification(
                        user_id=phase.assignee_id,
                        type="overdue_phase",
                        title_en=f"Overdue phase: {phase.name_en}",
                        title_ar=f"مرحلة متأخرة: {phase.name_ar or phase.name_en}",
                        body_en="Phase planned end date has passed.",
                        body_ar="انتهى التاريخ المخطط للمرحلة.",
                        entity_type="project_phase",
                        entity_id=phase.id,
                    )
                )
                created += 1

        # One day remaining — alert assignee
        for phase in (
            db.query(ProjectPhase)
            .filter(
                ProjectPhase.planned_end == tomorrow,
                ProjectPhase.deleted_at.is_(None),
            )
            .all()
        ):
            if phase.status_id in completed_ids:
                continue
            if phase.assignee_id and not already_notified(
                phase.assignee_id, "phase_due_soon", "project_phase", phase.id
            ):
                db.add(
                    Notification(
                        user_id=phase.assignee_id,
                        type="phase_due_soon",
                        title_en=f"1 day left: {phase.name_en}",
                        title_ar=f"يتبقى يوم واحد: {phase.name_ar or phase.name_en}",
                        body_en="This phase is due tomorrow and is not completed yet.",
                        body_ar="هذه المرحلة مستحقة غداً ولم تُنجز بعد.",
                        entity_type="project_phase",
                        entity_id=phase.id,
                    )
                )
                created += 1

        for finding in (
            db.query(Finding)
            .filter(
                Finding.due_date.isnot(None),
                Finding.due_date < today,
                Finding.deleted_at.is_(None),
            )
            .all()
        ):
            if finding.assignee_id and not already_notified(
                finding.assignee_id, "overdue_finding", "finding", finding.id
            ):
                db.add(
                    Notification(
                        user_id=finding.assignee_id,
                        type="overdue_finding",
                        title_en=f"Overdue finding: {finding.public_id}",
                        title_ar=f"ثغرة متأخرة: {finding.public_id}",
                        body_en=finding.title,
                        body_ar=finding.title,
                        entity_type="finding",
                        entity_id=finding.id,
                    )
                )
                created += 1
        db.commit()
        click.echo(f"Overdue/due-soon notifications queued: {created}")
    finally:
        db.close()


if __name__ == "__main__":
    cli()
