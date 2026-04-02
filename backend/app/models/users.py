import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Enum as SAEnum
# from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False,index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    role: Mapped[str] = mapped_column(SAEnum("admin", "candidate","recruiter",name="user_role"), nullable=False, default="candidate")

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
