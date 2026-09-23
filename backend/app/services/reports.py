"""Report generation — fill user templates with assessment data."""

from __future__ import annotations

import html
import json
from collections import Counter
from datetime import datetime, timezone

from sqlalchemy.orm import Session, joinedload

from app.core.mixins import utcnow
from app.models.lookups import FindingStatus, PhaseStatus, SeverityLevel
from app.models.platform import GeneratedReport, ReportTemplate
from app.models.projects import Project, ProjectMember, ProjectPhase, ProjectPhaseTool, Task
from app.models.security_data import Asset, Evidence, Finding, Tool
from app.reporting.pdf import build_report_html, content_sha256, html_to_pdf
from app.schemas import ReportGenerateRequest
from app.storage import get_storage


def _esc(value: object) -> str:
    return html.escape("" if value is None else str(value))


def _p(text: str) -> str:
    if not text:
        return "<p>—</p>"
    return f"<p>{_esc(text)}</p>"


def _normalize_language(lang: str | None) -> str:
    if not lang:
        return "en"
    lang = lang.lower().strip()
    if lang in {"both", "bi", "bilingual"}:
        return "bilingual"
    if lang.startswith("ar"):
        return "ar"
    return "en"


def _pick(language: str, en: str, ar: str) -> str:
    if language == "ar":
        return ar
    if language == "bilingual":
        return f"{en} / {ar}"
    return en


def _table(headers: list[str], rows: list[list[str]]) -> str:
    th = "".join(f"<th>{_esc(h)}</th>" for h in headers)
    body = ""
    for row in rows:
        body += "<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>"
    if not rows:
        body = f'<tr><td colspan="{len(headers)}">—</td></tr>'
    return f"<table><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table>"


def _apply_placeholders(md: str, ctx: dict) -> str:
    out = md or ""
    for key, val in ctx.items():
        out = out.replace("{{" + key + "}}", str(val))
    return out


def _build_context(project: Project, finding_rows: list[dict], stats: dict) -> dict:
    return {
        "project.name": project.name,
        "project.client": project.client_name or "",
        "project.description": project.description or "",
        "project.environment": project.environment or "",
        "project.scope_in": project.scope_in or "",
        "project.scope_out": project.scope_out or "",
        "project.roe": project.rules_of_engagement or "",
        "stats.total_findings": stats.get("total", 0),
        "stats.critical_count": stats.get("critical", 0),
        "stats.high_count": stats.get("high", 0),
        "stats.medium_count": stats.get("medium", 0),
        "stats.low_count": stats.get("low", 0),
        "stats.informational_count": stats.get("informational", 0),
    }


def _section_body(
    db: Session,
    *,
    section_type: str,
    content_md: str | None,
    project: Project,
    language: str,
    finding_rows: list[dict],
    stats: dict,
    include_evidence: bool,
    ctx: dict,
) -> str:
    st = (section_type or "custom").lower().strip()

    if st in {"cover"}:
        return (
            f"<p><strong>{_esc(_pick(language, 'Project', 'المشروع'))}:</strong> {_esc(project.name)}</p>"
            f"<p><strong>{_esc(_pick(language, 'Client', 'العميل'))}:</strong> {_esc(project.client_name or '—')}</p>"
            f"<p><strong>{_esc(_pick(language, 'Environment', 'البيئة'))}:</strong> {_esc(project.environment or '—')}</p>"
        )

    if st in {"executive_summary", "summary"}:
        body = content_md or project.description or ""
        body = _apply_placeholders(body, ctx)
        counts = (
            f"<p>{_pick(language, 'Findings overview', 'ملخص النتائج')}: "
            f"Critical={stats['critical']}, High={stats['high']}, "
            f"Medium={stats['medium']}, Low={stats['low']}, "
            f"Info={stats['informational']} (Total={stats['total']})</p>"
        )
        return _p(body) + counts if body else counts

    if st in {"scope"}:
        parts = []
        if project.scope_in:
            parts.append(
                f"<h3>{_esc(_pick(language, 'In scope', 'ضمن النطاق'))}</h3>{_p(project.scope_in)}"
            )
        if project.scope_out:
            parts.append(
                f"<h3>{_esc(_pick(language, 'Out of scope', 'خارج النطاق'))}</h3>{_p(project.scope_out)}"
            )
        if project.rules_of_engagement:
            parts.append(
                f"<h3>{_esc(_pick(language, 'Rules of engagement', 'قواعد الاشتباك'))}</h3>"
                f"{_p(project.rules_of_engagement)}"
            )
        custom = _apply_placeholders(content_md or "", ctx)
        if custom:
            parts.insert(0, _p(custom))
        return "".join(parts) or _p(project.description or "")

    if st in {"methodology"}:
        custom = _apply_placeholders(content_md or "", ctx)
        if custom:
            return _p(custom)
        return _p(
            _pick(
                language,
                "Assessment followed the selected methodology workflow phases, "
                "with documented tools, evidence, and finding validation.",
                "اتّبع التقييم مراحل منهجية سير العمل المختارة، مع توثيق الأدوات والأدلة والتحقق من النتائج.",
            )
        )

    if st in {"assets"}:
        assets = (
            db.query(Asset)
            .filter(Asset.project_id == project.id, Asset.deleted_at.is_(None))
            .order_by(Asset.id)
            .all()
        )
        rows = [
            [
                _esc(a.name),
                _esc(a.value),
                _esc(a.environment or "—"),
                _esc(a.status or "—"),
            ]
            for a in assets
        ]
        return _table(
            [
                _pick(language, "Name", "الاسم"),
                _pick(language, "Value", "القيمة"),
                _pick(language, "Environment", "البيئة"),
                _pick(language, "Status", "الحالة"),
            ],
            rows,
        )

    if st in {"tools_used", "tools"}:
        links = (
            db.query(ProjectPhaseTool)
            .join(ProjectPhase, ProjectPhase.id == ProjectPhaseTool.phase_id)
            .filter(
                ProjectPhase.project_id == project.id,
                ProjectPhase.deleted_at.is_(None),
            )
            .all()
        )
        tool_ids = {lnk.tool_id for lnk in links}
        tools = (
            db.query(Tool)
            .filter(Tool.id.in_(tool_ids or {-1}), Tool.deleted_at.is_(None))
            .all()
            if tool_ids
            else []
        )
        usage = {lnk.tool_id: lnk.usage_status for lnk in links}
        rows = []
        for tool in tools:
            name = _pick(language, tool.name_en, tool.name_ar or tool.name_en)
            rows.append(
                [
                    _esc(name),
                    _esc(tool.version or "—"),
                    _esc(usage.get(tool.id, "unused")),
                ]
            )
        return _table(
            [
                _pick(language, "Tool", "الأداة"),
                _pick(language, "Version", "الإصدار"),
                _pick(language, "Usage", "الاستخدام"),
            ],
            rows,
        )

    if st in {"timeline", "phases"}:
        status_map = {s.id: s.code for s in db.query(PhaseStatus).all()}
        phases = (
            db.query(ProjectPhase)
            .filter(ProjectPhase.project_id == project.id, ProjectPhase.deleted_at.is_(None))
            .order_by(ProjectPhase.sort_order)
            .all()
        )
        rows = []
        for ph in phases:
            name = _pick(language, ph.name_en, ph.name_ar or ph.name_en)
            rows.append(
                [
                    _esc(name),
                    _esc(status_map.get(ph.status_id or -1, "—")),
                    _esc(ph.planned_start or "—"),
                    _esc(ph.planned_end or "—"),
                    _esc(f"{ph.weight_percent or 0:.0f}%"),
                ]
            )
        return _table(
            [
                _pick(language, "Phase", "المرحلة"),
                _pick(language, "Status", "الحالة"),
                _pick(language, "Start", "البداية"),
                _pick(language, "End", "النهاية"),
                _pick(language, "Weight", "الوزن"),
            ],
            rows,
        )

    if st in {"findings_summary", "severity_distribution"}:
        rows = [
            [_esc(_pick(language, "Critical", "حرج")), str(stats["critical"])],
            [_esc(_pick(language, "High", "مرتفع")), str(stats["high"])],
            [_esc(_pick(language, "Medium", "متوسط")), str(stats["medium"])],
            [_esc(_pick(language, "Low", "منخفض")), str(stats["low"])],
            [_esc(_pick(language, "Informational", "معلوماتي")), str(stats["informational"])],
            [_esc(_pick(language, "Total", "المجموع")), str(stats["total"])],
        ]
        return _table(
            [_pick(language, "Severity", "الخطورة"), _pick(language, "Count", "العدد")],
            rows,
        )

    if st in {"detailed_findings", "findings"}:
        # Findings rendered globally by template engine; keep a short intro here
        custom = _apply_placeholders(content_md or "", ctx)
        return _p(custom) if custom else ""

    if st in {"recommendations"}:
        items = [
            f"<li><strong>{_esc(f['public_id'])}</strong>: {_esc(f['recommendation'] or '—')}</li>"
            for f in finding_rows
            if f.get("recommendation")
        ]
        custom = _apply_placeholders(content_md or "", ctx)
        html_parts = []
        if custom:
            html_parts.append(_p(custom))
        if items:
            html_parts.append("<ul>" + "".join(items) + "</ul>")
        return "".join(html_parts) or _p(
            _pick(language, "No recommendations recorded.", "لا توجد توصيات مسجّلة.")
        )

    if st in {"retest_results", "retest"}:
        return _p(
            _pick(
                language,
                "Retest results are tracked per finding when a retest is completed.",
                "نتائج إعادة الاختبار تُتتبّع لكل ثغرة عند إكمال إعادة الاختبار.",
            )
        )

    if st in {"conclusion"}:
        custom = _apply_placeholders(content_md or "", ctx)
        if custom:
            return _p(custom)
        return _p(
            _pick(
                language,
                f"The assessment of {project.name} identified {stats['total']} finding(s). "
                f"Critical: {stats['critical']}, High: {stats['high']}.",
                f"حدد تقييم {project.name} عدد {stats['total']} نتيجة/نتائج. "
                f"حرج: {stats['critical']}، مرتفع: {stats['high']}.",
            )
        )

    if st in {"appendix", "evidence"} and include_evidence:
        evidence = (
            db.query(Evidence)
            .filter(Evidence.project_id == project.id, Evidence.deleted_at.is_(None))
            .order_by(Evidence.id)
            .all()
        )
        rows = [
            [_esc(e.filename), _esc(e.mime_type), _esc(e.created_at.date() if e.created_at else "—")]
            for e in evidence
        ]
        return _table(
            [
                _pick(language, "File", "الملف"),
                _pick(language, "Type", "النوع"),
                _pick(language, "Date", "التاريخ"),
            ],
            rows,
        )

    if st in {"team", "members"}:
        members = (
            db.query(ProjectMember).filter(ProjectMember.project_id == project.id).all()
        )
        rows = []
        for m in members:
            from app.models.identity import User

            u = db.get(User, m.user_id)
            rows.append([_esc(u.full_name if u else m.user_id), _esc(m.role_label or "member")])
        return _table(
            [_pick(language, "Member", "العضو"), _pick(language, "Role", "الدور")],
            rows,
        )

    if st in {"tasks", "assigned_tasks"}:
        tasks = (
            db.query(Task)
            .filter(Task.project_id == project.id, Task.deleted_at.is_(None))
            .order_by(Task.id)
            .all()
        )
        rows = []
        for t in tasks:
            from app.models.identity import User

            assignee = db.get(User, t.assignee_id) if t.assignee_id else None
            rows.append(
                [
                    _esc(t.title),
                    _esc(assignee.full_name if assignee else "—"),
                    _esc(t.status),
                    _esc(t.due_date or "—"),
                ]
            )
        return _table(
            [
                _pick(language, "Task", "المهمة"),
                _pick(language, "Assignee", "المسند إليه"),
                _pick(language, "Status", "الحالة"),
                _pick(language, "Due", "الاستحقاق"),
            ],
            rows,
        )

    # custom / unknown — treat as markdown/plain with placeholders
    custom = _apply_placeholders(content_md or "", ctx)
    return _p(custom) if custom else ""


DEFAULT_SECTION_DEFS = [
    ("cover", "Cover Page", "صفحة الغلاف"),
    ("executive_summary", "Executive Summary", "الملخص التنفيذي"),
    ("scope", "Scope", "النطاق"),
    ("methodology", "Methodology", "المنهجية"),
    ("assets", "Assets", "الأصول"),
    ("tools_used", "Tools Used", "الأدوات المستخدمة"),
    ("timeline", "Assessment Timeline", "الجدول الزمني"),
    ("findings_summary", "Findings Summary", "ملخص النتائج"),
    ("severity_distribution", "Severity Distribution", "توزيع الخطورة"),
    ("detailed_findings", "Detailed Findings", "النتائج التفصيلية"),
    ("assigned_tasks", "Assigned Tasks", "المهام المسندة"),
    ("recommendations", "Recommendations", "التوصيات"),
    ("conclusion", "Conclusion", "الخاتمة"),
    ("appendix", "Appendix / Evidence", "الملحق / الأدلة"),
]


def generate_report(
    db: Session, data: ReportGenerateRequest, user_id: int
) -> GeneratedReport:
    language = _normalize_language(data.language)
    project = (
        db.query(Project)
        .options(joinedload(Project.phases))
        .filter(Project.id == data.project_id, Project.deleted_at.is_(None))
        .first()
    )
    if not project:
        from app.core.errors import AppError

        raise AppError("not_found", "Project not found", 404)

    template = None
    if data.template_id:
        template = (
            db.query(ReportTemplate)
            .options(joinedload(ReportTemplate.sections))
            .filter(ReportTemplate.id == data.template_id, ReportTemplate.deleted_at.is_(None))
            .first()
        )

    findings_q = db.query(Finding).filter(
        Finding.project_id == project.id, Finding.deleted_at.is_(None)
    )
    if data.severity_ids:
        findings_q = findings_q.filter(Finding.severity_id.in_(data.severity_ids))
    if data.status_ids:
        findings_q = findings_q.filter(Finding.status_id.in_(data.status_ids))
    findings = findings_q.order_by(Finding.id).all()

    sev_map = {s.id: s for s in db.query(SeverityLevel).all()}
    st_map = {s.id: s for s in db.query(FindingStatus).all()}

    finding_rows = []
    sev_counter: Counter[str] = Counter()
    for f in findings:
        sev = sev_map.get(f.severity_id) if f.severity_id else None
        st = st_map.get(f.status_id) if f.status_id else None
        code = (sev.code if sev else "unknown").lower()
        sev_counter[code] += 1
        if language == "ar":
            name = sev.name_ar if sev else ""
            st_name = st.name_ar if st else ""
        elif language == "bilingual" and sev:
            name = f"{sev.name_en} / {sev.name_ar}"
            st_name = f"{st.name_en} / {st.name_ar}" if st else ""
        else:
            name = sev.name_en if sev else ""
            st_name = st.name_en if st else ""
        finding_rows.append(
            {
                "public_id": f.public_id,
                "title": f.title,
                "description": f.description or "",
                "impact": f.impact or "",
                "recommendation": f.recommendation or "",
                "severity_code": code,
                "severity_name": name or "—",
                "status_name": st_name or "—",
            }
        )

    stats = {
        "total": len(finding_rows),
        "critical": sev_counter.get("critical", 0),
        "high": sev_counter.get("high", 0),
        "medium": sev_counter.get("medium", 0),
        "low": sev_counter.get("low", 0),
        "informational": sev_counter.get("informational", 0) + sev_counter.get("info", 0),
    }
    ctx = _build_context(project, finding_rows, stats)

    sections: list[dict[str, str]] = []
    include_findings_block = True

    if template and template.sections:
        for sec in sorted(template.sections, key=lambda s: s.sort_order):
            if not sec.enabled or sec.deleted_at:
                continue
            title = _pick(language, sec.title_en, sec.title_ar or sec.title_en)
            body = _section_body(
                db,
                section_type=sec.section_type,
                content_md=sec.content_md,
                project=project,
                language=language,
                finding_rows=finding_rows,
                stats=stats,
                include_evidence=bool(data.include_evidence),
                ctx=ctx,
            )
            if (sec.section_type or "").lower() in {"detailed_findings", "findings"}:
                include_findings_block = True
            sections.append({"title": title, "body": body})
    else:
        for code, en, ar in DEFAULT_SECTION_DEFS:
            if code == "appendix" and not data.include_evidence:
                continue
            title = _pick(language, en, ar)
            body = _section_body(
                db,
                section_type=code,
                content_md=None,
                project=project,
                language=language,
                finding_rows=finding_rows,
                stats=stats,
                include_evidence=bool(data.include_evidence),
                ctx=ctx,
            )
            sections.append({"title": title, "body": body})

    title = (
        f"التقرير الأمني — {project.name}"
        if language == "ar"
        else f"Security Assessment Report — {project.name}"
    )

    html_doc = build_report_html(
        title=title,
        project_name=project.name,
        language=language,
        classification=data.classification,
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        sections=sections,
        findings=finding_rows if include_findings_block else [],
    )

    report = GeneratedReport(
        project_id=project.id,
        template_id=data.template_id,
        generated_by_id=user_id,
        language=language,
        status="draft",
        title=title,
        content_html=html_doc,
        content_md=None,
        options_json=json.dumps({**data.model_dump(), "language": language}),
        classification=data.classification,
        sha256=content_sha256(html_doc),
    )
    db.add(report)
    db.flush()

    # Best-effort PDF; draft remains editable even if PDF fails
    pdf_bytes, fmt = html_to_pdf(html_doc)
    if pdf_bytes:
        key = f"reports/{report.id}.pdf"
        get_storage().put(key, pdf_bytes, "application/pdf")
        report.storage_key = key
        report.sha256 = content_sha256(pdf_bytes)
    elif fmt == "html":
        report.error_message = (
            "Server PDF engine unavailable; use browser Export PDF from the preview editor."
        )

    report.updated_at = utcnow()
    return report


def update_report_content(db: Session, report: GeneratedReport, content_html: str) -> GeneratedReport:
    if report.finalized_at:
        from app.core.errors import AppError

        raise AppError("locked", "Finalized reports cannot be edited", 400)
    report.content_html = content_html
    report.sha256 = content_sha256(content_html)
    report.status = "draft"
    report.version = int(report.version or 1) + 1
    report.updated_at = utcnow()

    pdf_bytes, _ = html_to_pdf(content_html)
    if pdf_bytes:
        key = f"reports/{report.id}.pdf"
        get_storage().put(key, pdf_bytes, "application/pdf")
        report.storage_key = key
        report.sha256 = content_sha256(pdf_bytes)
        report.error_message = None
    return report


def finalize_report(db: Session, report: GeneratedReport) -> GeneratedReport:
    if not report.content_html:
        from app.core.errors import AppError

        raise AppError("empty", "Report has no content", 400)
    # Ensure PDF snapshot if engine available
    if not report.storage_key:
        pdf_bytes, _ = html_to_pdf(report.content_html)
        if pdf_bytes:
            key = f"reports/{report.id}.pdf"
            get_storage().put(key, pdf_bytes, "application/pdf")
            report.storage_key = key
            report.sha256 = content_sha256(pdf_bytes)
    report.status = "ready"
    report.finalized_at = utcnow()
    report.updated_at = utcnow()
    return report
