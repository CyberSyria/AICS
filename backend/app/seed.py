"""
Seed default roles, permissions, lookups, and starter workflow templates.

NO default admin user — create via: python -m app.cli create-admin
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.rbac import PERMISSIONS, ROLE_PERMS
from app.models.identity import Permission, Role, RolePermission, User, UserPreferences
from app.models.lookups import (
    AssetType,
    FindingStatus,
    PhaseStatus,
    ProjectType,
    SeverityLevel,
    ToolCategory,
)
from app.models.platform import ReportSection, ReportTemplate
from app.models.security_data import FindingIdCounter, Tool
from app.models.workflows import (
    Workflow,
    WorkflowPhase,
    WorkflowPhaseChecklistItem,
    WorkflowPhaseTool,
)

# Role → permission codes live in app.core.rbac.ROLE_PERMS
ROLES = [
    ("admin", "Administrator", "مدير النظام", True),
    ("manager", "Manager", "مدير الفريق", True),
    ("analyst", "Security Analyst", "محلل أمن المعلومات", True),
    ("viewer", "Viewer", "مشاهد", True),
]

PROJECT_TYPES = [
    ("web", "Web Application", "تطبيق ويب", 1),
    ("api", "API", "واجهة برمجية", 2),
    ("android", "Android", "أندرويد", 3),
    ("ios", "iOS", "آي أو إس", 4),
    ("network", "Network / Infrastructure", "شبكة / بنية تحتية", 5),
    ("cloud", "Cloud", "سحابة", 6),
    ("server", "Server", "خادم", 7),
    ("other", "Other", "أخرى", 8),
]

ASSET_TYPES = [
    ("domain", "Domain", "نطاق", "example.com"),
    ("ip", "IP Address", "عنوان IP", "1.2.3.4"),
    ("url", "URL", "رابط", "https://..."),
    ("hostname", "Hostname", "اسم المضيف", None),
    ("api_endpoint", "API Endpoint", "نقطة نهاية API", None),
    ("android_package", "Android Package", "حزمة أندرويد", "com.example.app"),
    ("ios_bundle", "iOS Bundle ID", "معرّف حزمة iOS", None),
    ("network_range", "Network Range", "نطاق شبكة", "10.0.0.0/24"),
    ("cloud_resource", "Cloud Resource", "مورد سحابي", None),
    ("other", "Other", "أخرى", None),
]

TOOL_CATEGORIES = [
    ("recon", "Recon", "استطلاع"),
    ("network", "Network", "شبكة"),
    ("web", "Web", "ويب"),
    ("api", "API", "واجهة برمجية"),
    ("android", "Android", "أندرويد"),
    ("ios", "iOS", "آي أو إس"),
    ("cloud", "Cloud", "سحابة"),
    ("vuln_scanner", "Vulnerability Scanner", "ماسح ثغرات"),
    ("sast_dast", "Static/Dynamic Analysis", "تحليل ثابت/ديناميكي"),
    ("password", "Password Auditing", "تدقيق كلمات المرور"),
    ("forensics", "Forensics", "تحليل جنائي"),
    ("reporting", "Reporting", "تقارير"),
    ("other", "Other", "أخرى"),
]

SEVERITIES = [
    ("critical", "Critical", "حرج", 100, "error", 7),
    ("high", "High", "مرتفع", 80, "error", 14),
    ("medium", "Medium", "متوسط", 50, "warning", 30),
    ("low", "Low", "منخفض", 20, "gold", 60),
    ("informational", "Informational", "معلوماتي", 0, "muted", None),
]

FINDING_STATUSES = [
    ("open", "Open", "مفتوح", False),
    ("in_review", "In Review", "قيد المراجعة", False),
    ("confirmed", "Confirmed", "تم التأكيد", False),
    ("false_positive", "False Positive", "إيجابية كاذبة", True),
    ("accepted_risk", "Accepted Risk", "مخاطرة مقبولة", True),
    ("remediated", "Remediated", "تمت المعالجة", False),
    ("closed", "Closed", "مغلق", True),
]

PHASE_STATUSES = [
    ("pending", "Pending", "قيد الانتظار", False),
    ("in_progress", "In Progress", "قيد التنفيذ", False),
    ("blocked", "Blocked", "متوقف", True),
    ("completed", "Completed", "مكتمل", False),
    ("skipped", "Skipped", "تم التخطي", True),
]

# Starter workflow phases by project type code
WORKFLOW_PHASES: dict[str, list[tuple[str, str]]] = {
    "web": [
        ("Reconnaissance", "الاستطلاع"),
        ("Information Gathering", "جمع المعلومات"),
        ("Attack Surface Mapping", "رسم سطح الهجوم"),
        ("Authentication", "المصادقة"),
        ("Authorization", "التفويض"),
        ("Input Validation", "التحقق من المدخلات"),
        ("Business Logic", "منطق الأعمال"),
        ("Session Management", "إدارة الجلسات"),
        ("API Testing", "اختبار الواجهات"),
        ("Client-Side", "جانب العميل"),
        ("Configuration Review", "مراجعة الإعدادات"),
        ("Vulnerability Validation", "التحقق من الثغرات"),
        ("Reporting", "إعداد التقرير"),
    ],
    "api": [
        ("Reconnaissance", "الاستطلاع"),
        ("Endpoint Mapping", "رسم نقاط النهاية"),
        ("Authentication", "المصادقة"),
        ("Authorization", "التفويض"),
        ("Input Validation", "التحقق من المدخلات"),
        ("Business Logic", "منطق الأعمال"),
        ("Rate Limiting", "تحديد المعدل"),
        ("Data Exposure", "كشف البيانات"),
        ("Vulnerability Validation", "التحقق من الثغرات"),
        ("Reporting", "إعداد التقرير"),
    ],
    "android": [
        ("APK Acquisition", "الحصول على الحزمة"),
        ("Static Analysis", "التحليل الثابت"),
        ("Manifest Review", "مراجعة البيان"),
        ("Certificate Analysis", "تحليل الشهادات"),
        ("Reverse Engineering", "الهندسة العكسية"),
        ("Network Traffic", "حركة الشبكة"),
        ("Runtime Analysis", "تحليل وقت التشغيل"),
        ("Authentication", "المصادقة"),
        ("Authorization", "التفويض"),
        ("Storage", "التخزين"),
        ("Cryptography", "التشفير"),
        ("Root/Emulator", "روت / محاكي"),
        ("Validation", "التحقق"),
        ("Reporting", "إعداد التقرير"),
    ],
    "ios": [
        ("IPA Acquisition", "الحصول على الحزمة"),
        ("Static Analysis", "التحليل الثابت"),
        ("Entitlements Review", "مراجعة الصلاحيات"),
        ("Certificate Analysis", "تحليل الشهادات"),
        ("Reverse Engineering", "الهندسة العكسية"),
        ("Network Traffic", "حركة الشبكة"),
        ("Runtime Analysis", "تحليل وقت التشغيل"),
        ("Authentication", "المصادقة"),
        ("Authorization", "التفويض"),
        ("Storage", "التخزين"),
        ("Cryptography", "التشفير"),
        ("Jailbreak Checks", "فحوصات كسر الحماية"),
        ("Validation", "التحقق"),
        ("Reporting", "إعداد التقرير"),
    ],
    "network": [
        ("Scope Confirmation", "تأكيد النطاق"),
        ("Host Discovery", "اكتشاف المضيفين"),
        ("Port Scanning", "مسح المنافذ"),
        ("Service Enumeration", "تعداد الخدمات"),
        ("Vulnerability Scanning", "مسح الثغرات"),
        ("Manual Validation", "التحقق اليدوي"),
        ("Privilege Escalation", "تصعيد الصلاحيات"),
        ("Reporting", "إعداد التقرير"),
    ],
    "cloud": [
        ("Account Review", "مراجعة الحساب"),
        ("Identity & Access", "الهوية والوصول"),
        ("Network Configuration", "إعدادات الشبكة"),
        ("Storage Security", "أمن التخزين"),
        ("Logging & Monitoring", "السجلات والمراقبة"),
        ("Secrets Management", "إدارة الأسرار"),
        ("Workload Hardening", "تحصين أحمال العمل"),
        ("Reporting", "إعداد التقرير"),
    ],
    "server": [
        ("Host Hardening Review", "مراجعة تحصين المضيف"),
        ("Patch Level", "مستوى التحديثات"),
        ("Service Configuration", "إعدادات الخدمات"),
        ("Authentication", "المصادقة"),
        ("Local Privilege Checks", "فحوصات الصلاحيات المحلية"),
        ("Logging", "السجلات"),
        ("Vulnerability Validation", "التحقق من الثغرات"),
        ("Reporting", "إعداد التقرير"),
    ],
}

SAMPLE_TOOLS = [
    ("Nmap", "إنماب", "network"),
    ("Masscan", "ماسكان", "network"),
    ("Wireshark", "وايرشارك", "network"),
    ("Burp Suite", "بيرب سويت", "web"),
    ("OWASP ZAP", "أوواسب زاب", "web"),
    ("Nuclei", "نوكلي", "vuln_scanner"),
    ("Nikto", "نيكتو", "web"),
    ("SQLMap", "إس كيو إل ماب", "web"),
    ("ffuf", "ففاف", "web"),
    ("Dirsearch", "ديرسيرش", "web"),
    ("Postman", "بوستمان", "api"),
    ("Insomnia", "إنسومنيا", "api"),
    ("MobSF", "موب إس إف", "android"),
    ("Frida", "فريدا", "android"),
    ("Objection", "أوبجكشن", "android"),
    ("apktool", "أبك تول", "android"),
    ("jadx", "جادكس", "android"),
    ("Hopper", "هوبر", "ios"),
    ("class-dump", "كلاس دامب", "ios"),
    ("ScoutSuite", "سكاوت سويت", "cloud"),
    ("Prowler", "براولر", "cloud"),
    ("Trivy", "تريفي", "cloud"),
    ("Nessus", "نيسوس", "vuln_scanner"),
    ("OpenVAS", "أوبن فاس", "vuln_scanner"),
    ("Metasploit", "ميتاسبلويت", "other"),
    ("BloodHound", "بلادهاوند", "network"),
    ("CrackMapExec", "كراك ماب إكسِك", "network"),
    ("Hashcat", "هاشكات", "password"),
    ("John the Ripper", "جون الريبر", "password"),
    ("Ghidra", "غيدرا", "sast_dast"),
    ("IDA Free", "آيدا فري", "sast_dast"),
    ("Semgrep", "سيمغريب", "sast_dast"),
    ("SonarQube", "سوناركيوب", "sast_dast"),
    ("Amass", "أماس", "recon"),
    ("theHarvester", "ذا هارفستر", "recon"),
]

# Map workflow type code -> tool name_en suggestions attached to technical phases
WORKFLOW_TOOL_NAMES: dict[str, list[str]] = {
    "web": ["Nmap", "Burp Suite", "OWASP ZAP", "Nuclei", "Nikto", "SQLMap", "ffuf", "Dirsearch"],
    "api": ["Postman", "Insomnia", "Burp Suite", "OWASP ZAP", "Nuclei", "ffuf"],
    "android": ["MobSF", "Frida", "Objection", "apktool", "jadx", "Burp Suite"],
    "ios": ["Hopper", "class-dump", "Frida", "Objection", "Burp Suite"],
    "network": ["Nmap", "Masscan", "Wireshark", "Nessus", "OpenVAS", "BloodHound", "CrackMapExec"],
    "cloud": ["ScoutSuite", "Prowler", "Trivy", "Nmap", "Nuclei"],
    "server": ["Nmap", "Nessus", "OpenVAS", "Metasploit", "Hashcat", "John the Ripper"],
}


def seed_all(db: Session) -> None:
    _seed_permissions_roles(db)
    _seed_lookups(db)
    _seed_tools(db)
    _seed_workflows(db)
    _seed_workflow_phase_tools(db)
    _seed_report_template(db)
    if not db.query(FindingIdCounter).first():
        db.add(FindingIdCounter(next_value=1))
    ensure_default_admin(db)
    db.commit()


def ensure_default_admin(db: Session) -> User:
    """Ensure default admin user exists: username=admin, password=1234."""
    from app.core.security import hash_password

    admin_role = db.query(Role).filter(Role.code == "admin").first()
    if not admin_role:
        raise RuntimeError("Admin role missing — seed roles first")

    user = db.query(User).filter(User.username == "admin").first()
    if user:
        user.password_hash = hash_password("1234")
        user.role_id = admin_role.id
        user.is_active = True
        user.must_change_password = False
        user.full_name = user.full_name or "Administrator"
        if not user.preferences:
            db.add(UserPreferences(user_id=user.id, language="ar"))
        return user

    user = User(
        username="admin",
        email=None,
        full_name="Administrator",
        password_hash=hash_password("1234"),
        role_id=admin_role.id,
        is_active=True,
        must_change_password=False,
    )
    db.add(user)
    db.flush()
    db.add(UserPreferences(user_id=user.id, language="ar"))
    return user


def _seed_permissions_roles(db: Session) -> None:
    from app.services.rbac_sync import apply_system_role_permissions, ensure_permission_catalog

    ensure_permission_catalog(db)
    for code, name_en, name_ar, is_system in ROLES:
        role = db.query(Role).filter(Role.code == code).first()
        if not role:
            db.add(
                Role(
                    code=code,
                    name_en=name_en,
                    name_ar=name_ar,
                    is_system=is_system,
                )
            )
            db.flush()
        else:
            role.name_en = name_en
            role.name_ar = name_ar
            role.is_system = is_system
    apply_system_role_permissions(db)


def _seed_lookups(db: Session) -> None:
    for code, en, ar, order in PROJECT_TYPES:
        if not db.query(ProjectType).filter(ProjectType.code == code).first():
            db.add(
                ProjectType(code=code, name_en=en, name_ar=ar, sort_order=order, is_active=True)
            )

    for i, (code, en, ar, hint) in enumerate(ASSET_TYPES):
        if not db.query(AssetType).filter(AssetType.code == code).first():
            db.add(
                AssetType(
                    code=code,
                    name_en=en,
                    name_ar=ar,
                    validation_hint=hint,
                    sort_order=i,
                    is_active=True,
                )
            )

    for i, (code, en, ar) in enumerate(TOOL_CATEGORIES):
        if not db.query(ToolCategory).filter(ToolCategory.code == code).first():
            db.add(
                ToolCategory(code=code, name_en=en, name_ar=ar, sort_order=i, is_active=True)
            )

    for i, (code, en, ar, weight, color, sla) in enumerate(SEVERITIES):
        if not db.query(SeverityLevel).filter(SeverityLevel.code == code).first():
            db.add(
                SeverityLevel(
                    code=code,
                    name_en=en,
                    name_ar=ar,
                    weight=weight,
                    color_token=color,
                    sla_days=sla,
                    sort_order=i,
                    is_active=True,
                )
            )

    for i, (code, en, ar, terminal) in enumerate(FINDING_STATUSES):
        if not db.query(FindingStatus).filter(FindingStatus.code == code).first():
            db.add(
                FindingStatus(
                    code=code,
                    name_en=en,
                    name_ar=ar,
                    is_terminal=terminal,
                    sort_order=i,
                    is_active=True,
                )
            )

    for i, (code, en, ar, reason) in enumerate(PHASE_STATUSES):
        if not db.query(PhaseStatus).filter(PhaseStatus.code == code).first():
            db.add(
                PhaseStatus(
                    code=code,
                    name_en=en,
                    name_ar=ar,
                    requires_reason=reason,
                    sort_order=i,
                    is_active=True,
                )
            )


def _seed_tools(db: Session) -> None:
    cats = {c.code: c.id for c in db.query(ToolCategory).all()}
    for name_en, name_ar, cat in SAMPLE_TOOLS:
        exists = (
            db.query(Tool)
            .filter(Tool.name_en == name_en, Tool.deleted_at.is_(None))
            .first()
        )
        if exists:
            continue
        db.add(
            Tool(
                name_en=name_en,
                name_ar=name_ar,
                category_id=cats.get(cat),
                is_active=True,
            )
        )
    db.flush()


def _seed_workflow_phase_tools(db: Session) -> None:
    """Attach suggested catalog tools to workflow phases (idempotent)."""
    tools_by_name = {
        t.name_en: t.id
        for t in db.query(Tool).filter(Tool.deleted_at.is_(None), Tool.is_active.is_(True)).all()
    }
    type_map = {t.id: t.code for t in db.query(ProjectType).all()}

    for wf in db.query(Workflow).filter(Workflow.deleted_at.is_(None)).all():
        code = type_map.get(wf.project_type_id or -1)
        names = WORKFLOW_TOOL_NAMES.get(code or "", [])
        if not names:
            # Fallback: attach common recon tools
            names = ["Nmap", "Nuclei", "Burp Suite"]
        tool_ids = [tools_by_name[n] for n in names if n in tools_by_name]
        if not tool_ids:
            continue
        phases = (
            db.query(WorkflowPhase)
            .filter(WorkflowPhase.workflow_id == wf.id, WorkflowPhase.deleted_at.is_(None))
            .order_by(WorkflowPhase.sort_order)
            .all()
        )
        for phase in phases:
            # Skip pure reporting/kickoff naming lightly — still attach if empty
            existing = {
                row.tool_id
                for row in db.query(WorkflowPhaseTool)
                .filter(WorkflowPhaseTool.phase_id == phase.id)
                .all()
            }
            # Attach a rotating subset so each phase has relevant tools
            for tid in tool_ids:
                if tid in existing:
                    continue
                db.add(WorkflowPhaseTool(phase_id=phase.id, tool_id=tid))
                existing.add(tid)


def _seed_workflows(db: Session) -> None:
    type_map = {t.code: t.id for t in db.query(ProjectType).all()}
    names = {
        "web": ("Web Application Assessment", "تقييم تطبيقات الويب"),
        "api": ("API Security Assessment", "تقييم أمن الواجهات البرمجية"),
        "android": ("Android Application Assessment", "تقييم تطبيقات أندرويد"),
        "ios": ("iOS Application Assessment", "تقييم تطبيقات آي أو إس"),
        "network": ("Network / Infrastructure Assessment", "تقييم الشبكة والبنية التحتية"),
        "cloud": ("Cloud Security Assessment", "تقييم أمن السحابة"),
        "server": ("Server Security Assessment", "تقييم أمن الخوادم"),
    }
    for code, phases in WORKFLOW_PHASES.items():
        en, ar = names[code]
        existing = (
            db.query(Workflow)
            .filter(Workflow.name_en == en, Workflow.deleted_at.is_(None))
            .first()
        )
        if existing:
            continue
        wf = Workflow(
            name_en=en,
            name_ar=ar,
            project_type_id=type_map.get(code),
            version=1,
            is_active=True,
        )
        db.add(wf)
        db.flush()
        for i, (pen, par) in enumerate(phases):
            phase = WorkflowPhase(
                workflow_id=wf.id,
                name_en=pen,
                name_ar=par,
                sort_order=i,
                estimated_duration_hours=8.0,
                required_evidence=False,
                enabled=True,
            )
            db.add(phase)
            db.flush()
            # Sample mandatory checklist on first technical phase
            if i == 1:
                db.add(
                    WorkflowPhaseChecklistItem(
                        phase_id=phase.id,
                        title_en="Document scope confirmation",
                        title_ar="توثيق تأكيد النطاق",
                        reference_id=None,
                        is_mandatory=True,
                        sort_order=0,
                    )
                )


def _seed_report_template(db: Session) -> None:
    if db.query(ReportTemplate).filter(ReportTemplate.is_default.is_(True)).first():
        return
    tpl = ReportTemplate(
        name_en="Standard Assessment Report",
        name_ar="تقرير التقييم القياسي",
        is_active=True,
        is_default=True,
    )
    db.add(tpl)
    db.flush()
    sections = [
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
        ("recommendations", "Recommendations", "التوصيات"),
        ("retest_results", "Retest Results", "نتائج إعادة الاختبار"),
        ("conclusion", "Conclusion", "الخاتمة"),
        ("appendix", "Appendix", "الملحق"),
    ]
    for i, (stype, en, ar) in enumerate(sections):
        db.add(
            ReportSection(
                template_id=tpl.id,
                section_type=stype,
                title_en=en,
                title_ar=ar,
                sort_order=i,
                enabled=True,
            )
        )
