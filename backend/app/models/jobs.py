import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Enum as SAEnum, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    company_id: Mapped[str] = mapped_column(String,ForeignKey("users.id"), nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<Job(id={self.id}, title={self.title})>"

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"
    
    @property
    def is_candidate(self) -> bool:
        return self.role == "candidate"
    
    @property
    def is_recruiter(self) -> bool:
        return self.role == "recruiter"