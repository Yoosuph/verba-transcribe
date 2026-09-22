"""Minimal in-memory sliding-window rate limiter for LLM-triggering endpoints."""
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, Request

from app.config import settings

_events: Dict[str, Deque[float]] = defaultdict(deque)
_WINDOW_SECONDS = 60.0


def client_key(request: Request) -> None:
    pass


def _key_for(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def check_rate_limit(request: Request, bucket: str = "llm") -> None:
    """Raises 429 when the client exceeds rate_limit_llm_per_minute for `bucket`."""
    limit = settings.rate_limit_llm_per_minute
    if limit <= 0:
        return
    key = f"{bucket}:{_key_for(request)}"
    now = time.monotonic()
    window = _events[key]
    while window and now - window[0] > _WINDOW_SECONDS:
        window.popleft()
    if len(window) >= limit:
        raise HTTPException(status_code=429, detail="Rate limit exceeded, please retry shortly")
    window.append(now)


def check_ws_rate_limit(client_host: str, bucket: str = "llm_ws") -> bool:
    """WS variant (no Request object). Returns False when the limit is exceeded."""
    limit = settings.rate_limit_llm_per_minute
    if limit <= 0:
        return True
    key = f"{bucket}:{client_host or 'unknown'}"
    now = time.monotonic()
    window = _events[key]
    while window and now - window[0] > _WINDOW_SECONDS:
        window.popleft()
    if len(window) >= limit:
        return False
    window.append(now)
    return True


def reset() -> None:
    """Test helper: clear all counters."""
    _events.clear()
