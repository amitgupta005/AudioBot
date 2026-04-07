import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.candidates import Candidate
    from app.models.jobs import Job

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False,index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    role: Mapped[str] = mapped_column(SAEnum("admin", "candidate","recruiter",name="user_role"), nullable=False, default="candidate")
    jobs: Mapped[list["Job"]] = relationship(back_populates="company", lazy="raise")
    candidates: Mapped[list["Candidate"]] = relationship(back_populates="user", lazy="raise")

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email})>"

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"
    
    @property
    def is_candidate(self) -> bool:
        return self.role == "candidate"
    
    @property
    def is_recruiter(self) -> bool:
        return self.role == "recruiter"
