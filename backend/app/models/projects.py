"""Projects, phases, tasks, members, and time entries."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.mixins import SoftDeleteMixin, TimestampMixin


class Project(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    project_type_id: Mapped[int | None] = mapped_column(ForeignKey("project_types.id"), index=True)
    status: Mapped[str] = mapped_column(String(64), default="planned", index=True)
    priority: Mapped[str] = mapped_column(String(32), default="medium")
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    client_name: Mapped[str | None] = mapped_column(String(255))
    business_unit: Mapped[str | None] = mapped_column(String(255))
    start_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    workflow_id: Mapped[int | None] = mapped_column(ForeignKey("workflows.id"), index=True)
    scope_in: Mapped[str | None] = mapped_column(Text)
    scope_out: Mapped[str | None] = mapped_column(Text)
    rules_of_engagement: Mapped[str | None] = mapped_column(Text)
    environment: Mapped[str | None] = mapped_column(String(128))
    tags: Mapped[str | None] = mapped_column(Text)  # comma-separated or JSON

    phases: Mapped[list[ProjectPhase]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectPhase.sort_order",
    )
    members: Mapped[list[ProjectMember]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    tasks: Mapped[list[Task]] = relationship(back_populates="project", cascade="all, delete-orphan")


class ProjectPhase(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "project_phases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    source_workflow_phase_id: Mapped[int | None] = mapped_column(ForeignKey("workflow_phases.id"))
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(255), nullable=False)
    description_en: Mapped[str | None] = mapped_column(Text)
    description_ar: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    status_id: Mapped[int | None] = mapped_column(ForeignKey("phase_statuses.id"), index=True)
    status_reason: Mapped[str | None] = mapped_column(Text)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    planned_start: Mapped[date | None] = mapped_column(Date)
    planned_end: Mapped[date | None] = mapped_column(Date)
    actual_start: Mapped[date | None] = mapped_column(Date)
    actual_end: Mapped[date | None] = mapped_column(Date)
    estimated_duration_hours: Mapped[float | None] = mapped_column(Float)
    weight_percent: Mapped[float | None] = mapped_column(Float)  # share of project timeline
    required_evidence: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)

    project: Mapped[Project] = relationship(back_populates="phases")
    tools: Mapped[list[ProjectPhaseTool]] = relationship(
        back_populates="phase", cascade="all, delete-orphan"
    )
    tasks: Mapped[list[Task]] = relationship(back_populates="phase")


class ProjectPhaseTool(Base, TimestampMixin):
    __tablename__ = "project_phase_tools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phase_id: Mapped[int] = mapped_column(
        ForeignKey("project_phases.id", ondelete="CASCADE"), index=True
    )
    tool_id: Mapped[int] = mapped_column(ForeignKey("tools.id", ondelete="CASCADE"), index=True)
    was_used: Mapped[bool] = mapped_column(Boolean, default=False)
    # unused | in_use | used
    usage_status: Mapped[str] = mapped_column(String(32), default="unused")

    phase: Mapped[ProjectPhase] = relationship(back_populates="tools")


class ProjectMember(Base, TimestampMixin):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role_label: Mapped[str | None] = mapped_column(String(64))  # lead, analyst, etc.

    project: Mapped[Project] = relationship(back_populates="members")


class Task(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    phase_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_phases.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    assigned_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(64), default="pending", index=True)
    priority: Mapped[str] = mapped_column(String(32), default="medium")
    due_date: Mapped[date | None] = mapped_column(Date)
    estimated_hours: Mapped[float | None] = mapped_column(Float)
    actual_hours: Mapped[float | None] = mapped_column(Float)
    checklist_result: Mapped[str | None] = mapped_column(String(32))  # pass|fail|na|pending
    source_checklist_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("workflow_phase_checklist_items.id")
    )
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped[Project] = relationship(back_populates="tasks")
    phase: Mapped[ProjectPhase | None] = relationship(back_populates="tasks")
    comments: Mapped[list[TaskComment]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )


class TaskComment(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "task_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    task: Mapped[Task] = relationship(back_populates="comments")


class TimeEntry(Base, TimestampMixin):
    __tablename__ = "time_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    hours: Mapped[float] = mapped_column(Float, nullable=False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
