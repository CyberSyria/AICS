"""S3-compatible object storage backend."""

from __future__ import annotations

from app.core.config import get_settings
from app.core.errors import AppError
from app.storage.base import StorageBackend

settings = get_settings()


class S3Storage(StorageBackend):
    def __init__(self) -> None:
        try:
            import boto3
        except ImportError as exc:
            raise AppError("storage_unavailable", "boto3 is required for S3 storage", 500) from exc

        kwargs: dict = {
            "region_name": settings.S3_REGION,
            "aws_access_key_id": settings.S3_ACCESS_KEY_ID or None,
            "aws_secret_access_key": settings.S3_SECRET_ACCESS_KEY or None,
        }
        if settings.S3_ENDPOINT_URL:
            kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
        self.client = boto3.client("s3", **kwargs)
        self.bucket = settings.S3_BUCKET
        if not self.bucket:
            raise AppError("storage_misconfigured", "S3_BUCKET is required", 500)

    def put(self, key: str, data: bytes, content_type: str) -> str:
        self.client.put_object(
            Bucket=self.bucket, Key=key, Body=data, ContentType=content_type
        )
        return key

    def get(self, key: str) -> bytes:
        try:
            obj = self.client.get_object(Bucket=self.bucket, Key=key)
            return obj["Body"].read()
        except Exception as exc:
            raise AppError("not_found", "File not found in storage", 404) from exc

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False
