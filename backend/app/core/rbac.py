"""Role-based access control helpers and permission constants."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.identity import User

# Granular permission codes (seeded; admins can compose custom roles)
# Format: (code, name_en, name_ar, category)
PERMISSIONS: list[tuple[str, str, str, str]] = [
    ("admin.all", "Full administrative access", "الوصول الإداري الكامل", "admin"),
    ("user.manage", "Manage users (create/disable/reset)", "إدارة المستخدمين (إنشاء/تعطيل/إعادة تعيين)", "users"),
    ("user.read", "View users", "عرض المستخدمين", "users"),
    ("role.manage", "Manage roles and permission sets", "إدارة الأدوار ومجموعات الصلاحيات", "users"),
    ("settings.manage", "Manage app/org settings", "إدارة إعدادات التطبيق/المؤسسة", "admin"),
    ("lookup.manage", "Manage lookup tables", "إدارة جداول البحث", "admin"),
    ("audit.read", "Read audit logs", "قراءة سجلات التدقيق", "admin"),
    ("workflow.manage", "Manage workflow templates", "إدارة قوالب سير العمل", "workflows"),
    ("workflow.read", "View workflows", "عرض سير العمل", "workflows"),
    ("project.create", "Create projects", "إنشاء المشاريع", "projects"),
    ("project.manage", "Edit projects and membership", "تعديل المشاريع والأعضاء", "projects"),
    ("project.delete", "Delete projects", "حذف المشاريع", "projects"),
    ("project.read", "View projects", "عرض المشاريع", "projects"),
    ("phase.manage", "Edit and delete project phases", "تعديل وحذف مراحل المشروع", "projects"),
    ("task.manage", "Create and assign tasks", "إنشاء وإسناد المهام", "tasks"),
    ("task.update_own", "Update own assigned tasks", "تحديث المهام المسندة للذات", "tasks"),
    ("asset.manage", "Manage assets", "إدارة الأصول", "assets"),
    ("tool.manage", "Manage tools catalog", "إدارة كتالوج الأدوات", "assets"),
    ("finding.create", "Create findings", "إنشاء الثغرات", "findings"),
    ("finding.update", "Update any finding", "تحديث أي ثغرة", "findings"),
    ("finding.update_own", "Update own findings", "تحديث الثغرات الخاصة", "findings"),
    ("finding.confirm", "Confirm / approve findings", "تأكيد / اعتماد الثغرات", "findings"),
    ("finding.delete", "Delete findings", "حذف الثغرات", "findings"),
    ("finding.read", "View findings", "عرض الثغرات", "findings"),
    ("evidence.upload", "Upload evidence", "رفع الأدلة", "evidence"),
    ("evidence.download", "Download evidence", "تنزيل الأدلة", "evidence"),
    ("evidence.delete", "Delete evidence", "حذف الأدلة", "evidence"),
    ("report.manage", "Manage report templates", "إدارة قوالب التقارير", "reports"),
    ("report.generate", "Generate and edit reports", "إنشاء وتعديل التقارير", "reports"),
    ("report.delete", "Delete generated reports", "حذف التقارير المُنشأة", "reports"),
    ("notification.read", "Read notifications", "قراءة الإشعارات", "general"),
    ("dashboard.read", "View dashboard", "عرض لوحة التحكم", "general"),
    ("team.read", "View team workload", "عرض عبء عمل الفريق", "general"),
    ("search.read", "Use global search", "استخدام البحث العام", "general"),
]

def permission_category(code: str) -> str:
    for c, _en, _ar, cat in PERMISSIONS:
        if c == code:
            return cat
    return "general"


def user_permission_codes(user: User) -> set[str]:
    if not user.role:
        return set()
    codes = {rp.permission.code for rp in user.role.role_permissions if rp.permission}
    if "admin.all" in codes:
        return {p[0] for p in PERMISSIONS}
    return codes


def has_permission(user: User, code: str) -> bool:
    codes = user_permission_codes(user)
    return "admin.all" in codes or code in codes


def require_any(user: User, *codes: str) -> bool:
    return any(has_permission(user, c) for c in codes)


# Default permission sets for built-in roles
ROLE_PERMS: dict[str, list[str]] = {
    "admin": ["admin.all"],
    "manager": [
        "user.read",
        "lookup.manage",
        "workflow.manage",
        "workflow.read",
        "project.manage",
        "project.read",
        "task.manage",
        "asset.manage",
        "tool.manage",
        "finding.create",
        "finding.update",
        "finding.read",
        "evidence.upload",
        "evidence.download",
        "report.generate",
        "notification.read",
        "dashboard.read",
        "team.read",
        "search.read",
        "settings.manage",
    ],
    "analyst": [
        "workflow.read",
        "project.read",
        "task.update_own",
        "finding.create",
        "finding.update_own",
        "finding.read",
        "evidence.upload",
        "evidence.download",
        "notification.read",
        "dashboard.read",
        "search.read",
    ],
    "viewer": [
        "workflow.read",
        "project.read",
        "finding.read",
        "evidence.download",
        "notification.read",
        "dashboard.read",
        "search.read",
    ],
}
