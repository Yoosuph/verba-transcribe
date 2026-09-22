"""
P0 hardening regression tests:
- Session-ID validation (path traversal defence) on REST and WebSocket
- AudioAccumulator size cap enforcement (max_audio_size_mb)
- max_session_minutes derived limit + WebSocket-side enforcement
- Session TTL eviction (memory growth + audio file cleanup)
"""
import os
import time
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.services.session_manager import session_manager
from app.services.audio_recorder import AudioAccumulator

client = TestClient(app)


def test_is_valid_session_id_rejects_traversal_and_accepts_safe_ids():
    from app.config import is_valid_session_id
    assert is_valid_session_id("session_abc123")
    assert is_valid_session_id("Session-1_2")
    assert not is_valid_session_id("../etc/passwd")
    assert not is_valid_session_id("a/b")
    assert not is_valid_session_id("a b")
    assert not is_valid_session_id("")
    assert not is_valid_session_id("x" * 65)  # over the 64-char cap
    assert is_valid_session_id("x" * 64)


def test_rest_rejects_invalid_session_id():
    # '*' routes as a normal path segment but fails the safe-ID regex
    resp = client.get("/api/sessions/bad*id")
    assert resp.status_code == 400
    assert "Invalid session id" in resp.json()["detail"]


def test_rest_accepts_valid_session_id():
    resp = client.post("/api/sessions")
    assert resp.status_code == 200
    sid = resp.json()["id"]
    assert client.get(f"/api/sessions/{sid}").status_code == 200


def test_ws_rejects_invalid_session_id_without_connecting():
    got_connected = False
    try:
        with client.websocket_connect("/ws/transcribe/bad*id") as ws:
            msg = ws.receive_json()
            got_connected = msg.get("type") == "connected"
    except Exception:
        pass
    assert not got_connected, "Server must not accept sockets for invalid session ids"


def test_audio_accumulator_enforces_size_cap(monkeypatch):
    monkeypatch.setattr(settings, "max_audio_size_mb", 1)
    acc = AudioAccumulator("cap_test_session")
    chunk = b"\x00\x01" * (600 * 512)  # ~0.6MB per chunk

    acc.append_pcm(chunk)
    assert not acc.overflowed
    first_total = acc.total_bytes
    assert first_total > 0

    acc.append_pcm(chunk)  # pushes past 1MB -> must be dropped
    assert acc.overflowed is True
    assert acc.total_bytes == first_total  # second chunk rejected entirely
    assert acc.total_bytes <= settings.max_audio_size_mb * 1024 * 1024


def test_duration_limit_seconds_derived_from_config():
    acc = AudioAccumulator("dur_test_session")
    assert acc.duration_limit_seconds == settings.max_session_minutes * 60


def test_expired_sessions_evicted_with_audio_file():
    sid = "evict_test_session"
    session_manager.get_or_create(sid)

    os.makedirs(settings.temp_audio_dir, exist_ok=True)
    audio_path = os.path.join(settings.temp_audio_dir, f"{sid}.wav")
    with open(audio_path, "wb") as f:
        f.write(b"RIFF-dummy-audio-for-eviction-test")

    # Backdate past the TTL window
    session_manager._created_at[sid] = time.monotonic() - (session_manager.SESSION_TTL_SECONDS + 10)

    remaining_ids = [s.id for s in session_manager.list_all()]
    assert sid not in remaining_ids
    assert not os.path.exists(audio_path), "Expired session audio must be removed"


def test_active_sessions_are_not_evicted():
    sid = "keepalive_test_session"
    session_manager.start_recording(sid)
    old_clock = time.monotonic() - 1000
    session_manager._created_at[sid] = old_clock
    session_manager.add_live_final(sid, "still talking")

    # A fresh session triggers global eviction; ours was touched so it survives
    session_manager.get_or_create("other_session_for_eviction")
    remaining_ids = [s.id for s in session_manager.list_all()]
    assert sid in remaining_ids


def test_ws_enforces_max_session_duration(monkeypatch):
    """Server-side duration cap forces a stop on the live path (dead-config fix)."""
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "mock_mode_if_no_key", True)
    from app.websocket import transcription as ws_module
    from app.services.audio_recorder import AudioAccumulator as Acc

    # Shrink the limit to 1 second so a single chunk breaches it
    monkeypatch.setattr(Acc, "duration_limit_seconds", 1)

    sid = "limit_test_session"
    with client.websocket_connect(f"/ws/transcribe/{sid}") as ws:
        assert ws.receive_json()["type"] == "connected"
        ws.send_json({"type": "start", "session_id": sid, "language_mode": "auto"})

        # 1 second of 16kHz mono PCM -> duration_seconds >= 1 -> limit hit
        ws.send_bytes(b"\x00\x00" * 16000)

        event_types = []
        for _ in range(30):
            msg = ws.receive_json()
            event_types.append(msg["type"])
            if msg["type"] in ("complete", "error"):
                break

        assert "session_limit" in event_types
        assert "complete" in event_types

# ---------------------------------------------------------------------------
