"""Application settings loaded from environment / .env via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_NAME: str = "Security Assessment Management Platform"
    ENVIRONMENT: Literal["development", "staging", "production", "test"] = "development"
    DEBUG: bool = False
    SECRET_KEY: str = Field(default="dev-only-change-me-in-production-32chars!")

    # Database — SQLite for local/dev; set DATABASE_URL for PostgreSQL
    DATABASE_URL: str = f"sqlite:///{(BACKEND_ROOT / 'samp.db').as_posix()}"

    # CORS — comma-separated origins
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Session cookies (HttpOnly + CSRF double-submit — see security.py)
    SESSION_COOKIE_NAME: str = "samp_session"
    CSRF_COOKIE_NAME: str = "samp_csrf"
    SESSION_MAX_AGE_SECONDS: int = 60 * 60 * 8  # 8 hours
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    COOKIE_DOMAIN: str | None = None

    # Rate limiting (login)
    RATE_LIMIT_LOGIN: str = "10/minute"

    # Storage
    STORAGE_BACKEND: Literal["local", "s3", "vercel_blob"] = "local"
    STORAGE_LOCAL_PATH: str = str(BACKEND_ROOT / "storage")
    S3_BUCKET: str = ""
    S3_REGION: str = "us-east-1"
    S3_ENDPOINT_URL: str | None = None
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    VERCEL_BLOB_TOKEN: str = ""
    # Vercel Blob store auto-injects this name when linked to a project
    BLOB_READ_WRITE_TOKEN: str = ""
    MAX_UPLOAD_BYTES: int = 25 * 1024 * 1024  # 25 MiB

    # Password policy (min length; complexity optional — default admin uses short password)
    PASSWORD_MIN_LENGTH: int = 4
    PASSWORD_REQUIRE_COMPLEXITY: bool = False

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_strength(cls, v: str, info) -> str:
        return v

    @field_validator("DATABASE_URL")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        """Accept postgres:// / postgresql:// from Neon/Render → psycopg3 driver."""
        if not v:
            return v
        if v.startswith("postgres://"):
            return "postgresql+psycopg://" + v[len("postgres://") :]
        if v.startswith("postgresql://") and not v.startswith("postgresql+"):
            return "postgresql+psycopg://" + v[len("postgresql://") :]
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def blob_token(self) -> str:
        """Vercel Blob token — accepts either env name."""
        return (self.VERCEL_BLOB_TOKEN or self.BLOB_READ_WRITE_TOKEN or "").strip()

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    def validate_for_startup(self) -> None:
        if self.is_production and (
            not self.SECRET_KEY
            or self.SECRET_KEY.startswith("dev-only")
            or len(self.SECRET_KEY) < 32
        ):
            raise RuntimeError(
                "SECRET_KEY must be a strong random value (>=32 chars) in production"
            )
        if self.is_production and not self.COOKIE_SECURE:
            raise RuntimeError("COOKIE_SECURE must be true in production")


@lru_cache
def get_settings() -> Settings:
    return Settings()
