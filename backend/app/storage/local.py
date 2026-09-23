"""Local filesystem storage backend (default for local/VPS)."""

from __future__ import annotations

from pathlib import Path

from app.core.config import get_settings
from app.core.errors import AppError
from app.storage.base import StorageBackend

settings = get_settings()


class LocalStorage(StorageBackend):
    def __init__(self, root: str | None = None) -> None:
        self.root = Path(root or settings.STORAGE_LOCAL_PATH).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Prevent path traversal
        safe_key = Path(key).name
        path = (self.root / safe_key).resolve()
        if not str(path).startswith(str(self.root)):
            raise AppError("invalid_storage_key", "Invalid storage key", 400)
        return path

    def put(self, key: str, data: bytes, content_type: str) -> str:
        path = self._path(key)
        path.write_bytes(data)
        return key

    def get(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            raise AppError("not_found", "File not found in storage", 404)
        return path.read_bytes()

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.is_file():
            path.unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()
