"""initial schema

Revision ID: 20260415_0001
Revises:
Create Date: 2026-04-15 14:20:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260415_0001"
down_revision = None
branch_labels = None
depends_on = None


user_role = postgresql.ENUM(
    "admin",
    "candidate",
    "recruiter",
    name="user_role",
    create_type=False,
)

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
    user_role.create(bind, checkfirst=True)
    candidate_status.create(bind, checkfirst=True)
    interview_status.create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("company_name", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("role", user_role, nullable=False, server_default="candidate"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "jobs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("raw_job_description", sa.Text(), nullable=False),
        sa.Column("structured_job_description", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("company_id", sa.String(), nullable=False),
        sa.Column("company_name", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_jobs_company_id"), "jobs", ["company_id"], unique=False)

    op.create_table(
        "candidates",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("job_id", sa.String(), nullable=False),
        sa.Column("resume_text", sa.Text(), nullable=True),
        sa.Column("structured_resume", sa.JSON(), nullable=True),
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

    op.drop_index(op.f("ix_jobs_company_id"), table_name="jobs")
    op.drop_table("jobs")

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")

    bind = op.get_bind()
    interview_status.drop(bind, checkfirst=True)
    candidate_status.drop(bind, checkfirst=True)
    user_role.drop(bind, checkfirst=True)
