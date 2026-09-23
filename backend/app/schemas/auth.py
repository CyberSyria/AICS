"""Auth and user schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str

    @field_validator("username")
    @classmethod
    def normalize_username(cls, v: str) -> str:
        return v.strip().lower()


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=4)


class PasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=4)
    must_change: bool = True


class PreferencesUpdate(BaseModel):
    language: str | None = None
    timezone: str | None = None
    date_format: str | None = None
    theme: str | None = None
    notify_email: bool | None = None
    notify_in_app: bool | None = None


class PreferencesOut(ORMModel):
    language: str
    timezone: str
    date_format: str
    theme: str
    notify_email: bool
    notify_in_app: bool


class RoleBrief(ORMModel):
    id: int
    code: str
    name_en: str
    name_ar: str


class UserOut(ORMModel):
    id: int
    username: str
    email: str | None = None
    full_name: str
    role_id: int | None
    role: RoleBrief | None = None
    is_active: bool
    must_change_password: bool
    last_login_at: datetime | None = None
    preferences: PreferencesOut | None = None
    permissions: list[str] = []


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=4)
    role_id: int
    email: str | None = None
    is_active: bool = True

    @field_validator("username")
    @classmethod
    def normalize_username(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if not cleaned.replace("_", "").replace("-", "").isalnum():
            raise ValueError("username must be alphanumeric (with _ or -)")
        return cleaned


class UserUpdate(BaseModel):
    full_name: str | None = None
    role_id: int | None = None
    is_active: bool | None = None
    email: str | None = None
    username: str | None = None


class MeOut(UserOut):
    csrf_token: str | None = None


class RoleCreate(BaseModel):
    code: str
    name_en: str
    name_ar: str
    description_en: str | None = None
    description_ar: str | None = None
    permission_ids: list[int] = []


class RoleUpdate(BaseModel):
    name_en: str | None = None
    name_ar: str | None = None
    description_en: str | None = None
    description_ar: str | None = None
    permission_ids: list[int] | None = None


class PermissionOut(ORMModel):
    id: int
    code: str
    name_en: str
    name_ar: str
    category: str | None = None


class RoleOut(ORMModel):
    id: int
    code: str
    name_en: str
    name_ar: str
    description_en: str | None = None
    description_ar: str | None = None
    is_system: bool
    permissions: list[PermissionOut] = []
