# Architecture — Security Assessment Management Platform (SAMP)

## Overview

Monorepo with a React SPA (`frontend/`) and FastAPI API (`backend/`). One codebase; behavior differs only by environment variables (local / Docker / VPS / Vercel).

```text
Browser (EN|AR, LTR|RTL)
    │  HTTPS / same-origin proxy
    ▼
FastAPI /api/v1/*  →  PostgreSQL
    │                     ▲
    └─ StorageBackend ────┘ (metadata only; blobs on disk/S3/Blob)
```

## Layers (backend)

| Layer | Responsibility |
|-------|----------------|
| `api/v1` | Thin route handlers, auth deps, OpenAPI |
| `services` | Business rules, RBAC object checks, workflows, reports |
| `repositories` | SQLAlchemy queries |
| `models` | ORM entities |
| `schemas` | Pydantic v2 request/response |
| `storage` | `LocalStorage` / `S3Storage` / `VercelBlobStorage` |
| `reporting` | HTML→PDF (WeasyPrint), Markdown/HTML export |

## ERD (core tables)

**Identity:** `users`, `roles`, `permissions`, `role_permissions`, `user_preferences`, `app_settings`

**Lookups:** `project_types`, `asset_types`, `tool_categories`, `severity_levels`, `finding_statuses`, `phase_statuses`, `custom_field_definitions`

**Methodology:** `workflows`, `workflow_phases`, `workflow_phase_tools`, `workflow_phase_checklist_items`

**Execution:** `projects`, `project_phases`, `project_phase_tools`, `tasks`, `task_comments`, `project_members`, `time_entries`

**Security data:** `assets`, `findings` (+ sequence `SEC-####`), `finding_history`, `finding_templates`, `tools`, `evidence`, `retests`

**Platform:** `report_templates`, `report_sections`, `generated_reports`, `notifications`, `audit_logs`, `custom_field_values`

**Snapshot rule:** creating a project copies workflow phases/tools/checklists into project tables.

## API map (`/api/v1`)

| Prefix | Purpose |
|--------|---------|
| `/auth` | login, logout, me, password, setup |
| `/users`, `/roles` | identity & RBAC |
| `/lookups`, `/settings` | admin-configurable enumerations |
| `/workflows` | templates, phases, checklists, reorder |
| `/projects` | CRUD, wizard, phases, members, progress |
| `/tasks`, `/my-work`, `/team` | assignments & workload |
| `/assets`, `/tools` | inventory |
| `/findings`, `/evidence` | security data + uploads |
| `/reports` | templates + generate/export |
| `/notifications`, `/audit-logs`, `/search`, `/dashboard` | platform |

## Frontend routes

`/login`, `/dashboard`, `/my-work`, `/projects`, `/projects/new`, `/projects/:id`, `/projects/:id/timeline`, `/workflows`, `/workflows/new`, `/workflows/:id`, `/assets`, `/tools`, `/findings`, `/findings/:id`, `/evidence`, `/team`, `/reports`, `/reports/templates`, `/notifications`, `/audit-log`, `/settings`

## RBAC matrix (defaults)

| Permission group | Admin | Manager | Analyst | Viewer |
|------------------|:-----:|:-------:|:-------:|:------:|
| `*.manage` / all | ✓ | — | — | — |
| projects/workflows/tools | ✓ | ✓ | read assigned | read permitted |
| findings/evidence write | ✓ | ✓ | own/assigned | — |
| reports generate | ✓ | ✓ | — | — |
| users/roles/audit | ✓ | audit read* | — | — |

\* Managers may read audit for projects they own (configurable). Object-level checks prevent IDOR.

## i18n

- `react-i18next` with `en` / `ar` JSON locales
- Header toggle persists to `localStorage` + `user_preferences`
- `<html lang dir>` switched; CSS logical properties; Qamra font for Arabic + Latin UI
- API returns error `code`; UI translates messages

## Storage

`STORAGE_BACKEND=local|s3|vercel_blob`. Evidence never public; download via authenticated API (or short-lived signed URL).

## Deployment matrix

| Mode | Frontend | Backend | DB | Storage |
|------|----------|---------|----|---------|
| Local | Vite dev | Uvicorn | Postgres or SQLite | local |
| Docker | nginx static | Gunicorn | Postgres | volume |
| VPS | Nginx | Gunicorn | Postgres | local/S3 |
| Vercel | Vercel SPA | VPS/container (recommended) | managed Postgres | S3 / Vercel Blob |

Proxy `/api/*` from Vercel to backend for same-origin cookies.
