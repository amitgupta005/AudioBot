import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, Enum as SAEnum, Float, ForeignKey, String, Text,JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.interviews import Interview
    from app.models.jobs import Job
    from app.models.users import User

class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    job_id: Mapped[str] = mapped_column(String, ForeignKey("jobs.id"), nullable=False, index=True)
    resume_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    structured_resume: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(
        SAEnum("applied", "in_progress", "completed", "offered", "rejected", name="candidate_status"),
        default="applied",
        nullable=False,
    )
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    user: Mapped["User"] = relationship(back_populates="candidates", lazy="raise")
    job: Mapped["Job"] = relationship(back_populates="candidates", lazy="raise")
    interviews: Mapped[list["Interview"]] = relationship(back_populates="candidate", lazy="raise")

    def __repr__(self):
        return f"<Candidate(id={self.id}, user_id={self.user_id}, job_id={self.job_id})>"
