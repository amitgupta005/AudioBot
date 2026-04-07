import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.candidates import Candidate
    from app.models.interviews import Interview
    from app.models.users import User

class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    raw_job_description: Mapped[str] = mapped_column(Text, nullable=False)
    structured_job_description: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    company_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    company: Mapped["User"] = relationship(back_populates="jobs", lazy="raise")
    candidates: Mapped[list["Candidate"]] = relationship(back_populates="job", lazy="raise")
    interviews: Mapped[list["Interview"]] = relationship(back_populates="job", lazy="raise")

    def __repr__(self):
        return f"<Job(id={self.id}, title={self.title})>"
