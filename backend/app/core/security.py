"""
Authentication & password helpers.

Session strategy (documented choice):
  HttpOnly cookie session + CSRF double-submit token.
  - `samp_session`: signed opaque session token (HttpOnly, Secure in prod, SameSite)
  - `samp_csrf`: readable CSRF token cookie; client must echo it in `X-CSRF-Token` header
    on mutating requests (POST/PUT/PATCH/DELETE).
  Cross-origin SPA: prefer same-origin proxy (/api → backend) so SameSite=Lax works;
  otherwise set COOKIE_SAMESITE=none + COOKIE_SECURE=true + strict CORS.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import get_settings

_ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4, hash_len=32, salt_len=16)
settings = get_settings()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _ph.check_needs_rehash(password_hash)
    except Exception:
        return False


def generate_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


@dataclass
class SessionPayload:
    user_id: int
    session_id: str
    exp: int


def _sign(message: str) -> str:
    key = settings.SECRET_KEY.encode("utf-8")
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).hexdigest()


def create_session_token(user_id: int, session_id: str | None = None) -> str:
    """Create a signed session cookie value: user_id.session_id.exp.sig"""
    sid = session_id or generate_token(16)
    exp = int(time.time()) + settings.SESSION_MAX_AGE_SECONDS
    body = f"{user_id}.{sid}.{exp}"
    return f"{body}.{_sign(body)}"


def parse_session_token(token: str) -> SessionPayload | None:
    try:
        parts = token.split(".")
        if len(parts) != 4:
            return None
        user_id_s, sid, exp_s, sig = parts
        body = f"{user_id_s}.{sid}.{exp_s}"
        if not hmac.compare_digest(_sign(body), sig):
            return None
        exp = int(exp_s)
        if exp < int(time.time()):
            return None
        return SessionPayload(user_id=int(user_id_s), session_id=sid, exp=exp)
    except (ValueError, TypeError):
        return None


def password_meets_policy(password: str) -> tuple[bool, str | None]:
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        return False, "password_too_short"
    if settings.PASSWORD_REQUIRE_COMPLEXITY:
        if not any(c.isupper() for c in password):
            return False, "password_needs_upper"
        if not any(c.islower() for c in password):
            return False, "password_needs_lower"
        if not any(c.isdigit() for c in password):
            return False, "password_needs_digit"
    return True, None
