"""create candidates and interviews tables

Revision ID: 20260407_0004
Revises: 20260406_0003
Create Date: 2026-04-07 10:00:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260407_0004"
down_revision = "20260406_0003"
branch_labels = None
depends_on = None


candidate_status = postgresql.ENUM(
    "applied",
    "in_progress",
    "completed",
    "offered",
    "rejected",
    name="candidate_status",
    create_type=False,
)

interview_status = postgresql.ENUM(
    "scheduled",
    "in_progress",
    "completed",
    "cancelled",
    name="interview_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    candidate_status.create(bind, checkfirst=True)
    interview_status.create(bind, checkfirst=True)

    op.create_table(
        "candidates",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("job_id", sa.String(), nullable=False),
        sa.Column("resume_text", sa.Text(), nullable=True),
        sa.Column("status", candidate_status, nullable=False, server_default="applied"),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_candidates_job_id"), "candidates", ["job_id"], unique=False)
    op.create_index(op.f("ix_candidates_user_id"), "candidates", ["user_id"], unique=False)

    op.create_table(
        "interviews",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("candidate_id", sa.String(), nullable=False),
        sa.Column("job_id", sa.String(), nullable=False),
        sa.Column("status", interview_status, nullable=False, server_default="scheduled"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("report", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("transcript", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"]),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_interviews_candidate_id"), "interviews", ["candidate_id"], unique=False)
    op.create_index(op.f("ix_interviews_job_id"), "interviews", ["job_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_interviews_job_id"), table_name="interviews")
    op.drop_index(op.f("ix_interviews_candidate_id"), table_name="interviews")
    op.drop_table("interviews")

    op.drop_index(op.f("ix_candidates_user_id"), table_name="candidates")
    op.drop_index(op.f("ix_candidates_job_id"), table_name="candidates")
    op.drop_table("candidates")

    bind = op.get_bind()
    interview_status.drop(bind, checkfirst=True)
    candidate_status.drop(bind, checkfirst=True)
