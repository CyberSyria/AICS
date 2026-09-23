"""Report templates and generation."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import joinedload

from app.core.deps import CurrentUser, DbSession, require_permissions
from app.core.errors import AppError
from app.core.mixins import utcnow
from app.models.identity import User
from app.models.platform import GeneratedReport, ReportSection, ReportTemplate
from app.models.projects import Project
from app.schemas import GeneratedReportOut, ReportGenerateRequest, ReportTemplateCreate
from app.services.access import assert_project_access
from app.services.audit import write_audit
from app.services.reports import DEFAULT_SECTION_DEFS, finalize_report, generate_report, update_report_content
from app.storage import get_storage

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportContentUpdate(BaseModel):
    content_html: str


class ReportTemplateUpdate(BaseModel):
    name_en: str | None = None
    name_ar: str | None = None
    description_en: str | None = None
    description_ar: str | None = None
    is_active: bool | None = None
    is_default: bool | None = None
    sections: list | None = None


def _report_out(db, report: GeneratedReport) -> GeneratedReportOut:
    out = GeneratedReportOut.model_validate(report)
    proj = db.get(Project, report.project_id)
    if proj:
        out.project = {"id": proj.id, "name": proj.name}
    if report.template_id:
        tpl = db.get(ReportTemplate, report.template_id)
        if tpl:
            out.template = {"id": tpl.id, "name_en": tpl.name_en, "name_ar": tpl.name_ar}
    out.has_pdf = bool(report.storage_key)
    return out


def _template_dict(t: ReportTemplate) -> dict:
    return {
        "id": t.id,
        "name_en": t.name_en,
        "name_ar": t.name_ar,
        "description_en": t.description_en,
        "description_ar": t.description_ar,
        "description": t.description_en,
        "is_default": t.is_default,
        "is_active": t.is_active,
        "sections": [
            {
                "id": s.id,
                "section_type": s.section_type,
                "type": s.section_type,
                "title_en": s.title_en,
                "title_ar": s.title_ar,
                "content_md": s.content_md,
                "content": s.content_md,
                "sort_order": s.sort_order,
                "order": s.sort_order,
                "enabled": s.enabled,
            }
            for s in sorted(t.sections, key=lambda x: x.sort_order)
            if not s.deleted_at
        ],
    }


@router.get("/section-types")
def section_types(_: CurrentUser) -> list[dict]:
    return [
        {"code": code, "title_en": en, "title_ar": ar}
        for code, en, ar in DEFAULT_SECTION_DEFS
    ]


@router.get("/templates")
def list_templates(db: DbSession, _: CurrentUser) -> list[dict]:
    rows = (
        db.query(ReportTemplate)
        .options(joinedload(ReportTemplate.sections))
        .filter(ReportTemplate.deleted_at.is_(None))
        .all()
    )
    return [_template_dict(t) for t in rows]


@router.post("/templates", status_code=201)
def create_template(
    request: Request,
    body: ReportTemplateCreate,
    db: DbSession,
    user: User = Depends(require_permissions("admin.all")),
) -> dict:
    tpl = ReportTemplate(
        name_en=body.name_en,
        name_ar=body.name_ar or body.name_en,
        description_en=body.description_en,
        description_ar=body.description_ar,
        is_active=body.is_active,
        is_default=body.is_default,
    )
    db.add(tpl)
    db.flush()
    sections = body.sections
    if not sections:
        # Default full assessment template — data filled at generate time
        from app.schemas import ReportSectionCreate

        sections = [
            ReportSectionCreate(
                section_type=code,
                title_en=en,
                title_ar=ar,
                sort_order=i,
                enabled=True,
            )
            for i, (code, en, ar) in enumerate(DEFAULT_SECTION_DEFS)
        ]
    for sec in sections:
        payload = sec.model_dump() if hasattr(sec, "model_dump") else dict(sec)
        db.add(ReportSection(template_id=tpl.id, **payload))
    write_audit(
        db,
        action="report.template.create",
        user_id=user.id,
        entity_type="report_template",
        entity_id=tpl.id,
        request=request,
    )
    db.commit()
    db.refresh(tpl)
    tpl = (
        db.query(ReportTemplate)
        .options(joinedload(ReportTemplate.sections))
        .filter(ReportTemplate.id == tpl.id)
        .first()
    )
    return _template_dict(tpl)


@router.patch("/templates/{template_id}")
def update_template(
    template_id: int,
    body: ReportTemplateUpdate,
    db: DbSession,
    user: User = Depends(require_permissions("admin.all")),
) -> dict:
    tpl = (
        db.query(ReportTemplate)
        .options(joinedload(ReportTemplate.sections))
        .filter(ReportTemplate.id == template_id, ReportTemplate.deleted_at.is_(None))
        .first()
    )
    if not tpl:
        raise AppError("not_found", "Template not found", 404)
    data = body.model_dump(exclude_unset=True)
    sections = data.pop("sections", None)
    for k, v in data.items():
        setattr(tpl, k, v)
    if sections is not None:
        for old in tpl.sections:
            old.deleted_at = utcnow()
        for i, sec in enumerate(sections):
            db.add(
                ReportSection(
                    template_id=tpl.id,
                    section_type=sec.get("section_type") or sec.get("type") or "custom",
                    title_en=sec.get("title_en") or "Section",
                    title_ar=sec.get("title_ar") or sec.get("title_en") or "قسم",
                    content_md=sec.get("content_md") or sec.get("content"),
                    sort_order=sec.get("sort_order", i),
                    enabled=sec.get("enabled", True),
                )
            )
    db.commit()
    tpl = (
        db.query(ReportTemplate)
        .options(joinedload(ReportTemplate.sections))
        .filter(ReportTemplate.id == template_id)
        .first()
    )
    return _template_dict(tpl)


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: int,
    db: DbSession,
    _: User = Depends(require_permissions("admin.all")),
) -> dict:
    tpl = db.query(ReportTemplate).filter(
        ReportTemplate.id == template_id, ReportTemplate.deleted_at.is_(None)
    ).first()
    if not tpl:
        raise AppError("not_found", "Template not found", 404)
    tpl.deleted_at = utcnow()
    db.commit()
    return {"detail": "Deleted", "code": "ok"}


@router.post("/generate", response_model=GeneratedReportOut, status_code=201)
def generate(
    request: Request,
    body: ReportGenerateRequest,
    db: DbSession,
    user: User = Depends(require_permissions("report.generate", "admin.all")),
) -> GeneratedReportOut:
    assert_project_access(db, user, body.project_id)
    report = generate_report(db, body, user_id=user.id)
    write_audit(
        db,
        action="report.generate",
        user_id=user.id,
        entity_type="generated_report",
        entity_id=report.id,
        after={"project_id": body.project_id, "language": body.language},
        request=request,
    )
    db.commit()
    db.refresh(report)
    out = _report_out(db, report)
    out.content_html = report.content_html
    return out


@router.get("", response_model=list[GeneratedReportOut])
def list_reports(
    db: DbSession, user: CurrentUser, project_id: int | None = None
) -> list[GeneratedReportOut]:
    q = db.query(GeneratedReport).filter(GeneratedReport.deleted_at.is_(None))
    if project_id:
        assert_project_access(db, user, project_id)
        q = q.filter(GeneratedReport.project_id == project_id)
    return [_report_out(db, r) for r in q.order_by(GeneratedReport.id.desc()).all()]


@router.get("/{report_id}", response_model=GeneratedReportOut)
def get_report(report_id: int, db: DbSession, user: CurrentUser) -> GeneratedReportOut:
    report = db.get(GeneratedReport, report_id)
    if not report or report.deleted_at:
        raise AppError("not_found", "Report not found", 404)
    assert_project_access(db, user, report.project_id)
    out = _report_out(db, report)
    out.content_html = report.content_html
    return out


@router.patch("/{report_id}", response_model=GeneratedReportOut)
def patch_report(
    request: Request,
    report_id: int,
    body: ReportContentUpdate,
    db: DbSession,
    user: User = Depends(require_permissions("report.generate", "admin.all")),
) -> GeneratedReportOut:
    report = db.get(GeneratedReport, report_id)
    if not report or report.deleted_at:
        raise AppError("not_found", "Report not found", 404)
    assert_project_access(db, user, report.project_id)
    update_report_content(db, report, body.content_html)
    write_audit(
        db,
        action="report.update",
        user_id=user.id,
        entity_type="generated_report",
        entity_id=report.id,
        request=request,
    )
    db.commit()
    db.refresh(report)
    out = _report_out(db, report)
    out.content_html = report.content_html
    return out


@router.delete("/{report_id}")
def delete_report(
    request: Request,
    report_id: int,
    db: DbSession,
    user: User = Depends(require_permissions("report.delete", "admin.all")),
) -> dict:
    report = db.get(GeneratedReport, report_id)
    if not report or report.deleted_at:
        raise AppError("not_found", "Report not found", 404)
    # Allow deleting orphan reports whose project was soft-deleted / removed
    project = (
        db.query(Project)
        .filter(Project.id == report.project_id, Project.deleted_at.is_(None))
        .first()
    )
    if project is not None:
        assert_project_access(db, user, report.project_id)
    report.deleted_at = utcnow()
    write_audit(
        db,
        action="report.delete",
        user_id=user.id,
        entity_type="generated_report",
        entity_id=report.id,
        request=request,
    )
    db.commit()
    return {"detail": "Deleted", "code": "ok"}


@router.post("/{report_id}/finalize", response_model=GeneratedReportOut)
def finalize(
    request: Request,
    report_id: int,
    db: DbSession,
    user: User = Depends(require_permissions("report.generate", "admin.all")),
) -> GeneratedReportOut:
    report = db.get(GeneratedReport, report_id)
    if not report or report.deleted_at:
        raise AppError("not_found", "Report not found", 404)
    assert_project_access(db, user, report.project_id)
    finalize_report(db, report)
    write_audit(
        db,
        action="report.finalize",
        user_id=user.id,
        entity_type="generated_report",
        entity_id=report.id,
        request=request,
    )
    db.commit()
    db.refresh(report)
    return _report_out(db, report)


@router.get("/{report_id}/html")
def get_report_html(report_id: int, db: DbSession, user: CurrentUser) -> HTMLResponse:
    report = db.get(GeneratedReport, report_id)
    if not report or report.deleted_at:
        raise AppError("not_found", "Report not found", 404)
    assert_project_access(db, user, report.project_id)
    return HTMLResponse(content=report.content_html or "")


@router.get("/{report_id}/pdf")
def get_report_pdf(report_id: int, db: DbSession, user: CurrentUser) -> Response:
    report = db.get(GeneratedReport, report_id)
    if not report or report.deleted_at:
        raise AppError("not_found", "Report not found", 404)
    assert_project_access(db, user, report.project_id)
    if report.storage_key:
        data = get_storage().get(report.storage_key)
        return Response(
            content=data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="report-{report_id}.pdf"'},
        )
    # Fallback: return HTML when PDF engine unavailable
    return HTMLResponse(content=report.content_html or "")
