"""Shared Pydantic schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MessageOut(BaseModel):
    detail: str
    code: str = "ok"


class Paginated(BaseModel, Generic[T]):
    items: list[T]
    page: int = 1
    page_size: int = 20
    total: int = 0


class Timestamped(ORMModel):
    created_at: datetime | None = None
    updated_at: datetime | None = None


class IdName(ORMModel):
    id: int
    name_en: str | None = None
    name_ar: str | None = None
    code: str | None = None


class BilingualCreate(BaseModel):
    name_en: str = Field(min_length=1, max_length=255)
    name_ar: str = Field(min_length=1, max_length=255)


class ReorderItem(BaseModel):
    id: int
    sort_order: int
