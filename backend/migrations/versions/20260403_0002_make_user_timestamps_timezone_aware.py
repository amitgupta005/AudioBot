"""make user timestamps timezone aware

Revision ID: 20260403_0002
Revises: 20260403_0001
Create Date: 2026-04-03 20:35:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260403_0002"
down_revision = "20260403_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "created_at",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="created_at AT TIME ZONE 'UTC'",
        existing_nullable=False,
    )
    op.alter_column(
        "users",
        "updated_at",
        existing_type=sa.DateTime(),
        type_=sa.DateTime(timezone=True),
        postgresql_using="updated_at AT TIME ZONE 'UTC'",
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        postgresql_using="updated_at AT TIME ZONE 'UTC'",
        existing_nullable=False,
    )
    op.alter_column(
        "users",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(),
        postgresql_using="created_at AT TIME ZONE 'UTC'",
        existing_nullable=False,
    )
