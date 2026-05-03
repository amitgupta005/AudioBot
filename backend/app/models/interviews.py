import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.candidates import Candidate
    from app.models.jobs import Job

class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_id: Mapped[str] = mapped_column(String, ForeignKey("candidates.id"), nullable=False, index=True)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        SAEnum("scheduled", "in_progress", "completed", "cancelled", name="interview_status"),
        default="scheduled",
        nullable=False,
    )
    interview_mode: Mapped[str] = mapped_column(String(50), default="live", nullable=False)
    interview_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(50), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    report: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    transcript: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    candidate: Mapped["Candidate"] = relationship(back_populates="interviews", lazy="raise")
    job: Mapped["Job"] = relationship(back_populates="interviews", lazy="raise")

    def __repr__(self):
        return f"<Interview(id={self.id}, candidate_id={self.candidate_id}, job_id={self.job_id})>"
