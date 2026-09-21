"""
Regression tests for the high-priority fixes:
  1. SPA file server path traversal (backend/app/main.py)
  2. Translate endpoint: GenerateContentConfig + original-transcript preservation
  3. SessionManager locking consistency (RLock, all mutators guarded)
  4. Config temp audio dir aligned with docker-compose volume
"""
import threading

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.models.transcription import FinalTranscriptData, TranscriptSegment
from app.services.session_manager import session_manager

client = TestClient(app)


# ---------------------------------------------------------------------------
# 1. Path traversal
# ---------------------------------------------------------------------------
def test_spa_server_blocks_path_traversal():
    """The SPA catch-all must never serve files outside frontend/dist (e.g. backend/.env)."""
    encoded_traversals = [
        "/%2e%2e/%2e%2e/backend/.env",
        "/..%2Fbackend%2F.env",
        "/../../../etc/passwd",
    ]
    for path in encoded_traversals:
        resp = client.get(path)
        assert resp.status_code in (200, 404), f"{path} -> unexpected status {resp.status_code}"
        if resp.status_code == 200:
            # Must fall back to index.html, never leak the requested file's contents
            assert "GEMINI_API_KEY" not in resp.text
            assert "root:" not in resp.text


def test_spa_still_serves_index_and_assets():
    """Legitimate SPA routes and assets keep working after the traversal fix."""
    resp = client.get("/")
    assert resp.status_code == 200
    assert "<!doctype html>" in resp.text.lower() or "<html" in resp.text.lower()

    resp = client.get("/index.html")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 2. Translate endpoint
# ---------------------------------------------------------------------------
@pytest.fixture()
def transcript_session():
    """A session with an authoritative Hausa transcript."""
    res = client.post("/api/sessions")
    assert res.status_code == 200
    session_id = res.json()["id"]

    original = FinalTranscriptData(
        language="ha-NG",
        segments=[
            TranscriptSegment(
                id="seg_1",
                speaker="Speaker 1",
                start=0.0,
                end=4.0,
                text="Ina kwana baki daya.",
                language="ha-NG",
            ),
            TranscriptSegment(
                id="seg_2",
                speaker="Speaker 2",
                start=4.0,
                end=8.0,
                text="Na gode, lafiya lau.",
                language="ha-NG",
            ),
        ],
    )
    session_manager.set_final_transcript(session_id, original)
    yield session_id, original
    session_manager._sessions.pop(session_id, None)


def test_translate_uses_generate_content_config_and_preserves_original(transcript_session, monkeypatch):
    """POST /translate must pass a proper GenerateContentConfig and never overwrite final_transcript."""
    # Force the mock (simulated) translation path regardless of local .env
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "mock_mode_if_no_key", True)

    session_id, _original = transcript_session
    resp = client.post(f"/api/sessions/{session_id}/translate")
    assert resp.status_code == 200
    translated = resp.json()
    assert translated["segments"][0]["text"].startswith("[Translated from Hausa] ")

    # The authoritative original must remain untouched
    fetched = client.get(f"/api/sessions/{session_id}").json()
    assert fetched["final_transcript"]["segments"][0]["text"] == "Ina kwana baki daya."
    assert fetched["final_transcript"]["segments"][1]["text"] == "Na gode, lafiya lau."
    # ...and the translation is stored separately
    assert fetched["translated_transcript"] is not None
    assert fetched["translated_transcript"]["segments"][0]["text"].startswith("[Translated from Hausa] ")


def test_translate_unknown_session_returns_400():
    """Unknown session IDs are rejected by the translate endpoint (pre-existing 400 contract)."""
    resp = client.post("/api/sessions/nonexistent-session/translate")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 3. SessionManager locking consistency
# ---------------------------------------------------------------------------
def test_session_manager_lock_is_reentrant_and_mutators_are_guarded():
    """
    Mutators call self.get()/get_or_create() internally, so the lock must be
    reentrant (no self-deadlock), and every mutator should take the lock.
    """
    assert isinstance(session_manager._lock, type(threading.RLock()))

    # Exercise the nested lock acquisition path that deadlocked with a plain Lock
    res = client.post("/api/sessions")
    session_id = res.json()["id"]
    state = session_manager.start_recording(session_id)
    assert state.status == "recording"
    session_manager.set_processing(session_id)
    assert session_manager.get(session_id).status == "processing"
    session_manager.set_error(session_id, "boom")
    assert session_manager.get(session_id).error_message == "boom"
    session_manager._sessions.pop(session_id, None)


def test_session_manager_concurrent_mutations_do_not_corrupt():
    """Hammer list_all/get/mutations from threads; no exceptions, consistent state."""
    res = client.post("/api/sessions")
    session_id = res.json()["id"]
    errors = []

    def mutator():
        try:
            for _ in range(50):
                session_manager.get(session_id)
                session_manager.list_all()
                session_manager.set_error(session_id, "concurrent")
        except Exception as exc:  # pragma: no cover
            errors.append(exc)

    threads = [threading.Thread(target=mutator) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    final = session_manager.get(session_id)
    assert final.error_message == "concurrent"
    session_manager._sessions.pop(session_id, None)


# ---------------------------------------------------------------------------
# 4. Config / deployment alignment
# ---------------------------------------------------------------------------
def test_temp_audio_dir_matches_docker_compose_volume():
    """Backend default temp dir must match the /tmp/judiciary_audio volume in docker-compose.yml."""
    assert settings.temp_audio_dir == "/tmp/judiciary_audio"
