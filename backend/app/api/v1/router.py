"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import (
    assets_tools,
    auth,
    evidence,
    findings,
    lookups,
    platform_routes,
    projects,
    reports,
    tasks_work,
    users_roles,
    workflows,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(users_roles.router)
api_router.include_router(lookups.router)
api_router.include_router(workflows.router)
api_router.include_router(projects.router)
api_router.include_router(tasks_work.router)
api_router.include_router(assets_tools.router)
api_router.include_router(findings.router)
api_router.include_router(evidence.router)
api_router.include_router(reports.router)
api_router.include_router(platform_routes.router)
