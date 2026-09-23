"""Lookup, settings, workflow, project, and security-data schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel, ReorderItem  # noqa: F401


def _empty_str_to_none(v: Any) -> Any:
    if v == "" or v is None:
        return None
    return v


# ----- Lookups -----


class LookupBase(BaseModel):
    code: str
    name_en: str
    name_ar: str
    sort_order: int = 0
    is_active: bool = True


class LookupOut(ORMModel):
    id: int
    code: str
    name_en: str
    name_ar: str
    sort_order: int = 0
    is_active: bool = True


class SeverityOut(LookupOut):
    weight: int = 0
    color_token: str = "warning"
    sla_days: int | None = None


class SeverityCreate(LookupBase):
    weight: int = 0
    color_token: str = "warning"
    sla_days: int | None = None


class FindingStatusOut(LookupOut):
    is_terminal: bool = False


class FindingStatusCreate(LookupBase):
    is_terminal: bool = False


class PhaseStatusOut(LookupOut):
    requires_reason: bool = False


class PhaseStatusCreate(LookupBase):
    requires_reason: bool = False


class AssetTypeOut(LookupOut):
    validation_hint: str | None = None


class AssetTypeCreate(LookupBase):
    validation_hint: str | None = None


# ----- Tools -----


class ToolCreate(BaseModel):
    name_en: str
    name_ar: str = ""
    description_en: str | None = None
    description_ar: str | None = None
    category_id: int | None = None
    version: str | None = None
    website: str | None = None
    command_reference: str | None = None
    notes: str | None = None
    is_active: bool = True

    @field_validator("category_id", mode="before")
    @classmethod
    def _coerce_cat(cls, v: Any) -> Any:
        return _empty_str_to_none(v)


class ToolUpdate(BaseModel):
    name_en: str | None = None
    name_ar: str | None = None
    description_en: str | None = None
    description_ar: str | None = None
    category_id: int | None = None
    version: str | None = None
    website: str | None = None
    command_reference: str | None = None
    notes: str | None = None
    is_active: bool | None = None

    @field_validator("category_id", mode="before")
    @classmethod
    def _coerce_cat(cls, v: Any) -> Any:
        return _empty_str_to_none(v)


class ToolOut(ORMModel):
    id: int
    name_en: str
    name_ar: str
    name: str | None = None  # alias for frontend
    description_en: str | None = None
    description_ar: str | None = None
    description: str | None = None
    category_id: int | None = None
    version: str | None = None
    website: str | None = None
    command_reference: str | None = None
    notes: str | None = None
    is_active: bool = True


# ----- Workflows -----


class ChecklistItemCreate(BaseModel):
    title_en: str
    title_ar: str
    description_en: str | None = None
    description_ar: str | None = None
    reference_id: str | None = None
    is_mandatory: bool = False
    sort_order: int = 0


class ChecklistItemOut(ORMModel):
    id: int
    title_en: str
    title_ar: str
    description_en: str | None = None
    description_ar: str | None = None
    reference_id: str | None = None
    is_mandatory: bool
    sort_order: int


class WorkflowPhaseCreate(BaseModel):
    name_en: str
    name_ar: str
    description_en: str | None = None
    description_ar: str | None = None
    sort_order: int = 0
    estimated_duration_hours: float | None = None
    required_evidence: bool = False
    enabled: bool = True
    default_assignee_id: int | None = None
    tool_ids: list[int] = []
    checklist_items: list[ChecklistItemCreate] = []


class WorkflowPhaseOut(ORMModel):
    id: int
    name_en: str
    name_ar: str
    description_en: str | None = None
    description_ar: str | None = None
    sort_order: int
    estimated_duration_hours: float | None = None
    required_evidence: bool
    enabled: bool
    default_assignee_id: int | None = None
    tool_ids: list[int] = []
    checklist_items: list[ChecklistItemOut] = []


class WorkflowCreate(BaseModel):
    name_en: str
    name_ar: str
    description_en: str | None = None
    description_ar: str | None = None
    project_type_id: int | None = None
    is_active: bool = True
    phases: list[WorkflowPhaseCreate] = []


class WorkflowUpdate(BaseModel):
    name_en: str | None = None
    name_ar: str | None = None
    description_en: str | None = None
    description_ar: str | None = None
    project_type_id: int | None = None
    is_active: bool | None = None


class WorkflowOut(ORMModel):
    id: int
    name_en: str
    name_ar: str
    description_en: str | None = None
    description_ar: str | None = None
    project_type_id: int | None = None
    version: int
    is_active: bool
    phases: list[WorkflowPhaseOut] = []


# ----- Projects -----


class ProjectMemberIn(BaseModel):
    user_id: int
    role_label: str | None = None


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    project_type_id: int | None = None
    status: str = "planned"
    priority: str = "medium"
    owner_id: int | None = None
    client_name: str | None = None
    client: str | None = None  # frontend alias
    business_unit: str | None = None
    start_date: date | None = None
    due_date: date | None = None
    workflow_id: int | None = None
    scope_in: str | None = None
    scope_out: str | None = None
    rules_of_engagement: str | None = None
    environment: str | None = None
    tags: str | None = None
    members: list[ProjectMemberIn] = []
    member_ids: list[int] = []  # frontend alias
    phase_assignees: dict[int, int] = {}  # workflow_phase_id -> user_id
    phase_assignments: list[dict[str, Any]] = []  # frontend alias
    selected_phase_ids: list[int] = []  # workflow phase ids to include
    phase_weights: dict[int, float] = {}  # workflow_phase_id -> weight_percent

    @field_validator(
        "project_type_id",
        "owner_id",
        "workflow_id",
        "start_date",
        "due_date",
        mode="before",
    )
    @classmethod
    def _coerce_empty(cls, v: Any) -> Any:
        return _empty_str_to_none(v)

    @field_validator("member_ids", mode="before")
    @classmethod
    def _coerce_member_ids(cls, v: Any) -> Any:
        if not v:
            return []
        out: list[int] = []
        for item in v:
            if item in (None, ""):
                continue
            out.append(int(item))
        return out


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    owner_id: int | None = None
    client_name: str | None = None
    business_unit: str | None = None
    start_date: date | None = None
    due_date: date | None = None
    scope_in: str | None = None
    scope_out: str | None = None
    rules_of_engagement: str | None = None
    environment: str | None = None
    tags: str | None = None
    project_type_id: int | None = None
    member_ids: list[int] | None = None
    # [{phase_id, weight_percent, assignee_id, planned_start, planned_end, tool_ids}]
    phase_updates: list[dict[str, Any]] = []

    @field_validator(
        "owner_id",
        "project_type_id",
        "start_date",
        "due_date",
        mode="before",
    )
    @classmethod
    def _coerce_empty(cls, v: Any) -> Any:
        return _empty_str_to_none(v)

    @field_validator("member_ids", mode="before")
    @classmethod
    def _coerce_member_ids(cls, v: Any) -> Any:
        if v is None:
            return None
        out: list[int] = []
        for item in v:
            if item in (None, ""):
                continue
            out.append(int(item))
        return out


class UserBrief(ORMModel):
    id: int
    full_name: str
    username: str | None = None
    email: str | None = None
    role_code: str | None = None
    role_name_en: str | None = None
    role_name_ar: str | None = None


class ProjectPhaseToolOut(ORMModel):
    id: int
    tool_id: int
    usage_status: str = "unused"  # unused | in_use | used
    was_used: bool = False
    name_en: str | None = None
    name_ar: str | None = None
    category: str | None = None


class ProjectPhaseToolUpdate(BaseModel):
    usage_status: str  # unused | in_use | used


class ProjectPhaseOut(ORMModel):
    id: int
    project_id: int | None = None
    name_en: str
    name_ar: str
    sort_order: int
    status_id: int | None = None
    status: str | None = None
    status_reason: str | None = None
    assignee_id: int | None = None
    assignee: UserBrief | None = None
    planned_start: date | None = None
    planned_end: date | None = None
    actual_start: date | None = None
    actual_end: date | None = None
    estimated_duration_hours: float | None = None
    weight_percent: float | None = None
    days_allocated: int | None = None
    days_remaining: int | None = None
    required_evidence: bool = False
    notes: str | None = None
    findings_count: int = 0
    evidence_count: int = 0
    tasks_count: int = 0
    tools: list[ProjectPhaseToolOut] = []


class ProjectPhaseUpdate(BaseModel):
    status: str | None = None  # status code e.g. in_progress
    status_id: int | None = None
    status_reason: str | None = None
    assignee_id: int | None = None
    planned_start: date | None = None
    planned_end: date | None = None
    actual_start: date | None = None
    actual_end: date | None = None
    notes: str | None = None
    name_en: str | None = None
    name_ar: str | None = None
    sort_order: int | None = None
    weight_percent: float | None = None
    tool_ids: list[int] | None = None  # replace phase tools when set


class ProjectMemberOut(ORMModel):
    id: int
    user_id: int
    role: str | None = None
    role_label: str | None = None
    user: UserBrief | None = None


class ProjectOut(ORMModel):
    id: int
    name: str
    description: str | None = None
    project_type_id: int | None = None
    status: str
    priority: str
    owner_id: int | None = None
    owner: UserBrief | None = None
    client_name: str | None = None
    client: str | None = None  # alias for frontend
    business_unit: str | None = None
    start_date: date | None = None
    due_date: date | None = None
    completed_at: datetime | None = None
    workflow_id: int | None = None
    scope_in: str | None = None
    scope_out: str | None = None
    rules_of_engagement: str | None = None
    environment: str | None = None
    tags: str | None = None
    progress_percent: float = 0.0
    progress: float = 0.0  # alias for frontend
    phases: list[ProjectPhaseOut] = []
    members: list[ProjectMemberOut] = []


class TaskCreate(BaseModel):
    project_id: int
    phase_id: int | None = None
    title: str
    description: str | None = None
    assignee_id: int | None = None
    status: str = "pending"
    priority: str = "medium"
    due_date: date | None = None
    estimated_hours: float | None = None
    is_mandatory: bool = False


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    assignee_id: int | None = None
    status: str | None = None
    priority: str | None = None
    due_date: date | None = None
    estimated_hours: float | None = None
    actual_hours: float | None = None
    checklist_result: str | None = None


class TaskOut(ORMModel):
    id: int
    project_id: int
    phase_id: int | None = None
    title: str
    description: str | None = None
    assignee_id: int | None = None
    assigned_by_id: int | None = None
    status: str
    priority: str
    due_date: date | None = None
    estimated_hours: float | None = None
    actual_hours: float | None = None
    checklist_result: str | None = None
    is_mandatory: bool = False
    assignee: dict[str, Any] | None = None
    assigned_by: dict[str, Any] | None = None
    project: dict[str, Any] | None = None
    created_at: datetime | None = None

    @field_validator("assignee", "assigned_by", "project", mode="before")
    @classmethod
    def _ignore_orm_relations(cls, v: Any) -> Any:
        # Task ORM has relationship attrs with the same names; drop them here
        # and let the API layer attach brief dicts.
        if v is None or isinstance(v, dict):
            return v
        return None


class TaskCommentCreate(BaseModel):
    body: str = Field(min_length=1)


class TimeEntryCreate(BaseModel):
    task_id: int
    hours: float = Field(gt=0)
    work_date: date
    note: str | None = None


# ----- Assets / Findings / Evidence -----


class AssetCreate(BaseModel):
    project_id: int
    name: str
    asset_type_id: int | None = None
    value: str
    description: str | None = None
    environment: str | None = None
    status: str = "in_scope"
    tags: str | None = None


class AssetOut(ORMModel):
    id: int
    project_id: int
    name: str
    asset_type_id: int | None = None
    value: str
    description: str | None = None
    environment: str | None = None
    status: str
    tags: str | None = None


class FindingCreate(BaseModel):
    title: str
    description: str | None = None
    severity_id: int | None = None
    status_id: int | None = None
    project_id: int
    asset_id: int | None = None
    phase_id: int | None = None
    tool_id: int | None = None
    assignee_id: int | None = None
    affected_component: str | None = None
    impact: str | None = None
    recommendation: str | None = None
    reproduction_steps: str | None = None
    references: str | None = None
    cve: str | None = None
    cwe: str | None = None
    cvss_score: float | None = None
    cvss_vector: str | None = None
    owasp_mapping: str | None = None
    tags: str | None = None
    due_date: date | None = None
    notes: str | None = None

    @field_validator(
        "severity_id",
        "status_id",
        "asset_id",
        "phase_id",
        "tool_id",
        "assignee_id",
        "cvss_score",
        "due_date",
        mode="before",
    )
    @classmethod
    def _coerce_empty(cls, v: Any) -> Any:
        return _empty_str_to_none(v)


class FindingUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    severity_id: int | None = None
    status_id: int | None = None
    asset_id: int | None = None
    phase_id: int | None = None
    tool_id: int | None = None
    assignee_id: int | None = None
    affected_component: str | None = None
    impact: str | None = None
    recommendation: str | None = None
    reproduction_steps: str | None = None
    references: str | None = None
    cve: str | None = None
    cwe: str | None = None
    cvss_score: float | None = None
    cvss_vector: str | None = None
    owasp_mapping: str | None = None
    tags: str | None = None
    due_date: date | None = None
    notes: str | None = None


class FindingOut(ORMModel):
    id: int
    public_id: str
    human_id: str | None = None
    title: str
    description: str | None = None
    severity_id: int | None = None
    status_id: int | None = None
    project_id: int
    asset_id: int | None = None
    phase_id: int | None = None
    tool_id: int | None = None
    assignee_id: int | None = None
    reporter_id: int | None = None
    affected_component: str | None = None
    impact: str | None = None
    recommendation: str | None = None
    reproduction_steps: str | None = None
    references: str | None = None
    cve: str | None = None
    cwe: str | None = None
    cvss_score: float | None = None
    cvss_vector: str | None = None
    owasp_mapping: str | None = None
    tags: str | None = None
    due_date: date | None = None
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    severity: dict[str, Any] | None = None
    status: dict[str, Any] | None = None
    project: dict[str, Any] | None = None
    reporter: dict[str, Any] | None = None
    assignee: dict[str, Any] | None = None


class RetestCreate(BaseModel):
    assigned_to_id: int | None = None
    notes: str | None = None


class RetestUpdate(BaseModel):
    status: str  # verified | failed
    notes: str | None = None


class EvidenceOut(ORMModel):
    id: int
    filename: str
    mime_type: str
    size_bytes: int
    size: int | None = None  # alias for frontend
    sha256: str
    uploaded_by_id: int
    project_id: int
    phase_id: int | None = None
    task_id: int | None = None
    finding_id: int | None = None
    asset_id: int | None = None
    created_at: datetime | None = None
    project: dict[str, Any] | None = None
    uploaded_by: dict[str, Any] | None = None


# ----- Reports -----


class ReportSectionCreate(BaseModel):
    section_type: str
    title_en: str
    title_ar: str
    content_md: str | None = None
    sort_order: int = 0
    enabled: bool = True


class ReportTemplateCreate(BaseModel):
    name_en: str
    name_ar: str = ""
    description_en: str | None = None
    description_ar: str | None = None
    is_active: bool = True
    is_default: bool = False
    sections: list[ReportSectionCreate] = []


class ReportGenerateRequest(BaseModel):
    project_id: int
    template_id: int | None = None
    language: str = "en"  # en | ar | bilingual
    include_evidence: bool = True
    classification: str = "Confidential"
    severity_ids: list[int] | None = None
    status_ids: list[int] | None = None


class GeneratedReportOut(ORMModel):
    id: int
    project_id: int
    template_id: int | None = None
    language: str
    status: str
    version: int = 1
    title: str | None = None
    classification: str | None = None
    sha256: str | None = None
    finalized_at: datetime | None = None
    created_at: datetime | None = None
    content_html: str | None = None
    has_pdf: bool = False
    project: dict[str, Any] | None = None
    template: dict[str, Any] | None = None
    error_message: str | None = None


# ----- Notifications / Audit / Search / Dashboard -----


class NotificationOut(ORMModel):
    id: int
    type: str
    title_en: str
    title_ar: str
    body_en: str | None = None
    body_ar: str | None = None
    entity_type: str | None = None
    entity_id: int | None = None
    is_read: bool
    created_at: datetime | None = None


class AuditLogOut(ORMModel):
    id: int
    user_id: int | None = None
    user: UserBrief | None = None
    action: str
    entity_type: str | None = None
    entity: str | None = None  # alias for frontend
    entity_id: int | None = None
    ip_address: str | None = None
    before_summary: str | None = None
    after_summary: str | None = None
    summary: str | None = None  # alias for frontend
    request_id: str | None = None
    created_at: datetime | None = None


class SearchResult(BaseModel):
    entity_type: str
    entity_id: int
    title: str
    subtitle: str | None = None
    extra: dict[str, Any] = {}


class DashboardOut(BaseModel):
    total_projects: int = 0
    active_projects: int = 0
    completed_projects: int = 0
    open_findings_by_severity: list[dict[str, Any]] = []
    findings_by_project: list[dict[str, Any]] = []
    overdue_findings: int = 0
    overdue_tasks: int = 0
    overdue_phases: int = 0
    my_open_tasks: int = 0
    my_open_findings: int = 0
    my_work_summary: dict[str, Any] = {}
    recent_activity: list[dict[str, Any]] = []
    upcoming_deadlines: list[dict[str, Any]] = []
    project_status_distribution: list[dict[str, Any]] = []
    team_workload: list[dict[str, Any]] = []
    assessment_progress: list[dict[str, Any]] = []
    recent_findings: list[dict[str, Any]] = []


class SettingOut(ORMModel):
    id: int
    key: str
    value: str | None = None
    value_json: str | None = None
    description_en: str | None = None
    description_ar: str | None = None


class SettingUpdate(BaseModel):
    value: str | None = None
    value_json: str | None = None
