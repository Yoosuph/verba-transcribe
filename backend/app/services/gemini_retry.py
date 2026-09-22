"""Lightweight retry for transient Gemini API errors (503 overload, 429 quota)."""
import asyncio
import logging
from typing import Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

RETRIABLE_MARKERS = (
    "503",
    "UNAVAILABLE",
    "429",
    "RESOURCE_EXHAUSTED",
    "overloaded",
    "deadline",
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
            message = str(exc)
            retriable = any(marker in message for marker in RETRIABLE_MARKERS)
            if not retriable or attempt == attempts - 1:
                raise
            delay = base_delay * (attempt + 1)
            logger.warning("Transient Gemini error (retrying in %.1fs): %s", delay, exc)
            await asyncio.sleep(delay)
    raise last  # pragma: no cover
