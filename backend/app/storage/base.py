"""Storage backend abstraction for evidence blobs."""

from __future__ import annotations

import hashlib
import mimetypes
import re
import secrets
from abc import ABC, abstractmethod
from pathlib import Path

from app.core.config import get_settings
from app.core.errors import AppError

settings = get_settings()

ALLOWED_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".pdf",
    ".txt",
    ".json",
    ".xml",
    ".csv",
    ".log",
    ".nmap",
    ".zip",
}

ALLOWED_MIME = {
    "image/png",
    "image/jpeg",
    "application/pdf",
    "text/plain",
    "application/json",
    "application/xml",
    "text/xml",
    "text/csv",
    "application/zip",
    "application/x-zip-compressed",
}


def sanitize_filename(name: str) -> str:
    name = Path(name).name  # strip path components
    name = re.sub(r"[^\w.\- ()\[\]]+", "_", name, flags=re.UNICODE)
    return name[:200] or "file"


def validate_upload(filename: str, content: bytes, content_type: str | None) -> tuple[str, str]:
    safe = sanitize_filename(filename)
    ext = Path(safe).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise AppError("invalid_file_type", f"File type {ext} not allowed", 400)
    if len(content) > settings.MAX_UPLOAD_BYTES:
        raise AppError("file_too_large", "File exceeds maximum upload size", 400)
    if b"\x00" in content[:1024] and ext in {".txt", ".csv", ".json", ".xml", ".log"}:
        raise AppError("invalid_file_content", "Binary content in text upload", 400)

    mime = content_type or mimetypes.guess_type(safe)[0] or "application/octet-stream"
    # Soft MIME check — browsers lie; extension is primary gate
    if mime not in ALLOWED_MIME and not mime.startswith("text/"):
        # still allow if extension is ok
        pass
    return safe, mime


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def random_storage_key(ext: str) -> str:
    return f"{secrets.token_hex(16)}{ext.lower()}"


class StorageBackend(ABC):
    @abstractmethod
    def put(self, key: str, data: bytes, content_type: str) -> str:
        ...

    @abstractmethod
    def get(self, key: str) -> bytes:
        ...

    @abstractmethod
    def delete(self, key: str) -> None:
        ...

    @abstractmethod
    def exists(self, key: str) -> bool:
        ...
