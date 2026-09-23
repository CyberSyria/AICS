# Database

## Engine

- **Production:** PostgreSQL 16+
- **Local smoke tests:** SQLite allowed via `DATABASE_URL=sqlite:///./samp.db` — do not rely on SQLite-only features

## Migrations

```bash
cd backend
alembic upgrade head
# rollback one revision:
alembic downgrade -1
```

## Conventions

- UTC `created_at` / `updated_at`
- Soft delete (`deleted_at`) where business requires history
- FK indexes on all filter/join columns
- Finding human IDs via dedicated counter (`SEC-0001`) — never reuse after delete
- Workflow snapshot: project tables are copies; template edits do not mutate running projects

## Core relations

```text
roles ──< role_permissions >── permissions
users.role_id → roles
projects.workflow_id → workflows (template reference)
projects ──< project_phases ──< tasks
project_phases copied from workflow_phases on create
findings → projects, assets, project_phases, tools, severity_levels, finding_statuses
evidence → projects (+ optional phase/finding/asset)
audit_logs append-only
```

See ORM models under `backend/app/models/`.
