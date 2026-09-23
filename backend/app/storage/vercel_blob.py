"""Vercel Blob storage backend (HTTPS API)."""

from __future__ import annotations

import httpx

from app.core.config import get_settings
from app.core.errors import AppError
from app.storage.base import StorageBackend

settings = get_settings()


class VercelBlobStorage(StorageBackend):
    """
    Minimal Vercel Blob client using the REST API.
    Requires VERCEL_BLOB_TOKEN or BLOB_READ_WRITE_TOKEN.
    Suitable for serverless evidence when local disk is unavailable.
    """

    BASE = "https://blob.vercel-storage.com"

    def __init__(self) -> None:
        if not settings.blob_token:
            raise AppError(
                "storage_misconfigured",
                "VERCEL_BLOB_TOKEN or BLOB_READ_WRITE_TOKEN is required",
                500,
            )
        self.token = settings.blob_token
        self._url_map: dict[str, str] = {}

    def put(self, key: str, data: bytes, content_type: str) -> str:
        headers = {
            "Authorization": f"Bearer {self.token}",
            "X-Content-Type": content_type,
        }
        with httpx.Client(timeout=60.0) as client:
            resp = client.put(f"{self.BASE}/{key}", content=data, headers=headers)
            if resp.status_code >= 400:
                raise AppError("storage_error", f"Vercel Blob upload failed: {resp.status_code}", 502)
            body = resp.json()
            url = body.get("url") or body.get("downloadUrl")
            if url:
                self._url_map[key] = url
        return key

    def get(self, key: str) -> bytes:
        url = self._url_map.get(key)
        if not url:
            # Attempt direct path — callers should store URL in DB for production
            raise AppError(
                "not_found",
                "Blob URL not cached; store download URL in metadata for Vercel Blob",
                404,
            )
        with httpx.Client(timeout=60.0) as client:
            resp = client.get(url, headers={"Authorization": f"Bearer {self.token}"})
            if resp.status_code >= 400:
                raise AppError("not_found", "File not found in storage", 404)
            return resp.content

    def delete(self, key: str) -> None:
        url = self._url_map.pop(key, None)
        if not url:
            return
        with httpx.Client(timeout=30.0) as client:
            client.request(
                "DELETE",
                url,
                headers={"Authorization": f"Bearer {self.token}"},
            )

    def exists(self, key: str) -> bool:
        return key in self._url_map
