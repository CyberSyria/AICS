"""Alembic revision: add evidence.task_id."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_evidence_task_id"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "evidence" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("evidence")}
    if "task_id" not in cols:
        op.add_column("evidence", sa.Column("task_id", sa.Integer(), nullable=True))
        try:
            op.create_index("ix_evidence_task_id", "evidence", ["task_id"])
        except Exception:
            pass


def downgrade() -> None:
    try:
        op.drop_index("ix_evidence_task_id", table_name="evidence")
    except Exception:
        pass
    try:
        op.drop_column("evidence", "task_id")
    except Exception:
        pass
