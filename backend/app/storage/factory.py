"""Factory for StorageBackend based on STORAGE_BACKEND env."""

from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.storage.base import StorageBackend
from app.storage.local import LocalStorage


@lru_cache
def get_storage() -> StorageBackend:
    settings = get_settings()
    backend = settings.STORAGE_BACKEND
    if backend == "s3":
        from app.storage.s3 import S3Storage

        return S3Storage()
    if backend == "vercel_blob":
        from app.storage.vercel_blob import VercelBlobStorage

        return VercelBlobStorage()
    return LocalStorage()
