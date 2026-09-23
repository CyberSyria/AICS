"""Workflow templates, phases, tools, and checklist items."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.mixins import SoftDeleteMixin, TimestampMixin


class Workflow(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(255), nullable=False)
    description_en: Mapped[str | None] = mapped_column(Text)
    description_ar: Mapped[str | None] = mapped_column(Text)
    project_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_types.id"), index=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    parent_workflow_id: Mapped[int | None] = mapped_column(ForeignKey("workflows.id"))

    phases: Mapped[list[WorkflowPhase]] = relationship(
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="WorkflowPhase.sort_order",
    )


class WorkflowPhase(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "workflow_phases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workflow_id: Mapped[int] = mapped_column(
        ForeignKey("workflows.id", ondelete="CASCADE"), index=True
    )
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(255), nullable=False)
    description_en: Mapped[str | None] = mapped_column(Text)
    description_ar: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    estimated_duration_hours: Mapped[float | None] = mapped_column()
    required_evidence: Mapped[bool] = mapped_column(Boolean, default=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    default_assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    workflow: Mapped[Workflow] = relationship(back_populates="phases")
    tools: Mapped[list[WorkflowPhaseTool]] = relationship(
        back_populates="phase", cascade="all, delete-orphan"
    )
    checklist_items: Mapped[list[WorkflowPhaseChecklistItem]] = relationship(
        back_populates="phase",
        cascade="all, delete-orphan",
        order_by="WorkflowPhaseChecklistItem.sort_order",
    )


class WorkflowPhaseTool(Base, TimestampMixin):
    __tablename__ = "workflow_phase_tools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phase_id: Mapped[int] = mapped_column(
        ForeignKey("workflow_phases.id", ondelete="CASCADE"), index=True
    )
    tool_id: Mapped[int] = mapped_column(ForeignKey("tools.id", ondelete="CASCADE"), index=True)

    phase: Mapped[WorkflowPhase] = relationship(back_populates="tools")
    tool: Mapped["Tool"] = relationship()  # noqa: F821


class WorkflowPhaseChecklistItem(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "workflow_phase_checklist_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phase_id: Mapped[int] = mapped_column(
        ForeignKey("workflow_phases.id", ondelete="CASCADE"), index=True
    )
    title_en: Mapped[str] = mapped_column(String(512), nullable=False)
    title_ar: Mapped[str] = mapped_column(String(512), nullable=False)
    description_en: Mapped[str | None] = mapped_column(Text)
    description_ar: Mapped[str | None] = mapped_column(Text)
    reference_id: Mapped[str | None] = mapped_column(String(128))  # e.g. WSTG-ATHN-01
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    phase: Mapped[WorkflowPhase] = relationship(back_populates="checklist_items")
