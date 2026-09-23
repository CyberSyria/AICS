"""Simple in-memory rate limiter for login (works without breaking FastAPI signatures)."""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from app.core.errors import AppError

_lock = Lock()
_hits: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(key: str, *, limit: int = 10, window: int = 60) -> None:
    """Raise AppError 429 if more than `limit` hits within `window` seconds."""
    now = time.monotonic()
    with _lock:
        window_start = now - window
        hits = [t for t in _hits[key] if t >= window_start]
        if len(hits) >= limit:
            _hits[key] = hits
            raise AppError("rate_limited", "Too many login attempts. Try again later.", 429)
        hits.append(now)
        _hits[key] = hits


def parse_rate_limit(spec: str) -> tuple[int, int]:
    """Parse '10/minute' or '10/60' into (limit, window_seconds)."""
    try:
        count_s, period = spec.split("/", 1)
        count = int(count_s)
        period = period.strip().lower()
        if period in {"minute", "min", "m"}:
            return count, 60
        if period in {"hour", "h"}:
            return count, 3600
        if period in {"second", "sec", "s"}:
            return count, 1
        return count, int(period)
    except Exception:
        return 10, 60
