"""Lightweight retry for transient Gemini API errors (503 overload, 429 quota)."""
import asyncio
import logging
from typing import Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

RETRIABLE_MARKERS = (
    "503",
    "UNAVAILABLE",
    "overloaded",
    "deadline",
    "high demand",
)


def is_retriable(message: str) -> bool:
    """Transient errors are worth retrying in-place; daily quotas are not.

    Free-tier daily quota errors (quotaId contains 'PerDay', retry in ~50s)
    must fail fast so the model-rotation chain reaches a model that still has
    quota instead of sleeping through this one. Minute-level 429s and 503s
    remain retriable.
    """
    if "PerDay" in message or "per day" in message.lower():
        return False
    return any(marker in message for marker in RETRIABLE_MARKERS) or (
        ("429" in message or "RESOURCE_EXHAUSTED" in message) and "retry in" in message.lower()
    )


async def call_with_retry(
    factory: Callable[[], Awaitable[T]],
    *,
    attempts: int = 3,
    base_delay: float = 2.0,
) -> T:
    """Invoke `factory()` up to `attempts` times on transient Gemini errors.

    The factory is re-invoked on each attempt so a fresh coroutine is created
    every time (important for the async google-genai client).
    """
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return await factory()
        except Exception as exc:
            last = exc
            if not is_retriable(str(exc)) or attempt == attempts - 1:
                raise
            delay = base_delay * (attempt + 1)
            logger.warning("Transient Gemini error (retrying in %.1fs): %s", delay, exc)
            await asyncio.sleep(delay)
    raise last  # pragma: no cover
