"""Assets, findings, tools, evidence, and retests."""

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
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.mixins import SoftDeleteMixin, TimestampMixin


class Tool(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "tools"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    name_ar: Mapped[str] = mapped_column(String(255), nullable=False)
    description_en: Mapped[str | None] = mapped_column(Text)
    description_ar: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("tool_categories.id"), index=True
    )
    version: Mapped[str | None] = mapped_column(String(64))
    website: Mapped[str | None] = mapped_column(String(512))
    command_reference: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    category = relationship("ToolCategory", back_populates="tools")


class Asset(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_type_id: Mapped[int | None] = mapped_column(ForeignKey("asset_types.id"), index=True)
    value: Mapped[str] = mapped_column(String(1024), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    environment: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(64), default="in_scope")
    tags: Mapped[str | None] = mapped_column(Text)


class FindingIdCounter(Base):
    """Monotonic counter for SEC-#### IDs — never reused even after soft delete."""

    __tablename__ = "finding_id_counter"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    next_value: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class Finding(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    severity_id: Mapped[int | None] = mapped_column(ForeignKey("severity_levels.id"), index=True)
    status_id: Mapped[int | None] = mapped_column(ForeignKey("finding_statuses.id"), index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"), index=True)
    phase_id: Mapped[int | None] = mapped_column(ForeignKey("project_phases.id"), index=True)
    tool_id: Mapped[int | None] = mapped_column(ForeignKey("tools.id"), index=True)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    reporter_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    affected_component: Mapped[str | None] = mapped_column(String(512))
    impact: Mapped[str | None] = mapped_column(Text)
    recommendation: Mapped[str | None] = mapped_column(Text)
    reproduction_steps: Mapped[str | None] = mapped_column(Text)
    references: Mapped[str | None] = mapped_column(Text)
    cve: Mapped[str | None] = mapped_column(String(64))
    cwe: Mapped[str | None] = mapped_column(String(64))
    cvss_score: Mapped[float | None] = mapped_column(Float)
    cvss_vector: Mapped[str | None] = mapped_column(String(255))
    owasp_mapping: Mapped[str | None] = mapped_column(String(255))
    tags: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)

    history: Mapped[list[FindingHistory]] = relationship(
        back_populates="finding", cascade="all, delete-orphan"
    )
    retests: Mapped[list[Retest]] = relationship(
        back_populates="finding", cascade="all, delete-orphan"
    )


class FindingHistory(Base, TimestampMixin):
    __tablename__ = "finding_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    finding_id: Mapped[int] = mapped_column(
        ForeignKey("findings.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    field_name: Mapped[str] = mapped_column(String(128), nullable=False)
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)

    finding: Mapped[Finding] = relationship(back_populates="history")


class FindingTemplate(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "finding_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title_en: Mapped[str] = mapped_column(String(512), nullable=False)
    title_ar: Mapped[str] = mapped_column(String(512), nullable=False)
    description_en: Mapped[str | None] = mapped_column(Text)
    description_ar: Mapped[str | None] = mapped_column(Text)
    impact_en: Mapped[str | None] = mapped_column(Text)
    impact_ar: Mapped[str | None] = mapped_column(Text)
    recommendation_en: Mapped[str | None] = mapped_column(Text)
    recommendation_ar: Mapped[str | None] = mapped_column(Text)
    references: Mapped[str | None] = mapped_column(Text)
    severity_id: Mapped[int | None] = mapped_column(ForeignKey("severity_levels.id"))
    cwe: Mapped[str | None] = mapped_column(String(64))
    owasp_mapping: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Evidence(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)  # sanitized display name
    storage_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    phase_id: Mapped[int | None] = mapped_column(ForeignKey("project_phases.id"), index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), index=True)
    finding_id: Mapped[int | None] = mapped_column(ForeignKey("findings.id"), index=True)
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"), index=True)


class Retest(Base, TimestampMixin):
    __tablename__ = "retests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    finding_id: Mapped[int] = mapped_column(
        ForeignKey("findings.id", ondelete="CASCADE"), index=True
    )
    requested_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(64), default="requested")  # requested|verified|failed
    notes: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    finding: Mapped[Finding] = relationship(back_populates="retests")
