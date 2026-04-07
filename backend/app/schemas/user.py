from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

class UserRole(str, Enum):
    ADMIN = "admin"
    CANDIDATE = "candidate"
    RECRUITER = "recruiter"

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    company_name: Optional[str | None] = None
    role: UserRole = UserRole.CANDIDATE

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower().strip()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        # if len(v) < 8:
        #     raise ValueError("Password must be at least 8 characters long")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer for bcrypt compatibility")
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower().strip()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer for bcrypt compatibility")
        return v

class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    company_name: Optional[str | None] = None
    role: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse
