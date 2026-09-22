"""OpenRouter chat-completions fallback for when the Gemini model chain fails.

Used only as a secondary path (quota exhausted / outage). Never called when
OPENROUTER_API_KEY is unset. Returns raw assistant text; callers parse JSON.
"""
import json
import logging
from typing import List, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(30.0, connect=8.0)


def is_configured() -> bool:
    return bool(settings.openrouter_api_key.strip())


async def chat_completion(
    *,
    system: str,
    user: str,
    model: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: int = 2500,
) -> str:
    """Single OpenRouter chat call. Raises on HTTP/transport errors.

    Tries each configured model once. On 402 (credit limit) retries the same
    model with a smaller max_tokens budget before moving on.
    """
    if not is_configured():
        raise RuntimeError("OPENROUTER_API_KEY is not configured")

    models: List[str] = [model] if model else list(settings.openrouter_models)
    last_error: Optional[Exception] = None

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for m in models:
            if not m:
                continue
            attempts = [max_tokens]
            if max_tokens > 800:
                attempts.append(800)
            for attempt_tokens in attempts:
                payload = {
                    "model": m,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "temperature": temperature,
                    "max_tokens": attempt_tokens,
                }
                try:
                    resp = await client.post(
                        f"{settings.openrouter_base_url.rstrip('/')}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.openrouter_api_key}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                except httpx.HTTPError as exc:
                    last_error = exc
                    logger.warning("OpenRouter transport error on %s: %s", m, exc)
                    break  # next model

                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices") or []
                    content = ((choices[0].get("message") or {}).get("content")) if choices else None
                    if content and content.strip():
                        logger.info("OpenRouter fallback succeeded with model %s", m)
                        return content
                    last_error = RuntimeError(f"OpenRouter empty content from {m}")
                    break  # next model

                body = resp.text[:300]
                last_error = RuntimeError(f"OpenRouter {m} HTTP {resp.status_code}: {body}")
                logger.warning("OpenRouter model %s failed: HTTP %s %s", m, resp.status_code, body)

                if resp.status_code in (401, 403):
                    # Auth/permission problems fail for every model — stop early.
                    raise last_error

                if resp.status_code == 402 and attempt_tokens != attempts[-1]:
                    # Credit limit tied to max_tokens — retry smaller, same model.
                    continue

                break  # next model

    raise last_error or RuntimeError("OpenRouter fallback produced no result")


def extract_json(text: str) -> dict:
    """Parse a JSON object from model output, tolerating ```json fences."""
    if not text:
        raise ValueError("empty OpenRouter response")
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```", 2)[1] if cleaned.count("```") >= 2 else cleaned
        if cleaned.lstrip().startswith("json"):
            cleaned = cleaned.lstrip()[4:]
    # Prefer the first {...} span
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start : end + 1]
    data = json.loads(cleaned)
    if isinstance(data, dict):
        data = _normalize(data)
    return data


def _normalize(data: dict) -> dict:
    """Coerce fields the model sometimes returns in the wrong shape."""
    # speaker_contributions: sometimes a string instead of list[dict]
    sc = data.get("speaker_contributions")
    if isinstance(sc, str):
        data["speaker_contributions"] = [{"speaker": "unknown", "summary": sc}]
    elif isinstance(sc, list):
        fixed = []
        for item in sc:
            if isinstance(item, str):
                fixed.append({"speaker": "unknown", "summary": item})
            elif isinstance(item, dict):
                fixed.append(item)
        data["speaker_contributions"] = fixed

    # decisions / action_items: tolerate a bare list[str]
    dec = data.get("decisions")
    if isinstance(dec, list):
        fixed = []
        for item in dec:
            if isinstance(item, str):
                fixed.append({"decision": item, "evidence_segment_ids": []})
            elif isinstance(item, dict):
                fixed.append(item)
        data["decisions"] = fixed

    act = data.get("action_items")
    if isinstance(act, list):
        fixed = []
        for item in act:
            if isinstance(item, str):
                fixed.append({"task": item, "evidence_segment_ids": [], "completed": False})
            elif isinstance(item, dict):
                fixed.append(item)
        data["action_items"] = fixed

    for key in ("key_points", "questions"):
        val = data.get(key)
        if isinstance(val, str):
            data[key] = [val] if val.strip() else []
    return data
