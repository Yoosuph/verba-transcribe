"""
P0 hardening regression tests:
- Session-ID validation (path traversal defence) on REST and WebSocket
- Server-generated session IDs (unknown IDs rejected on WebSocket)
- AudioAccumulator size cap enforcement (max_audio_size_mb)
- max_session_minutes derived limit + WebSocket-side enforcement
- Retention sweeps (session_retention_days / audio_retention_days)
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


def test_session_ids_are_server_generated():
    """POST /api/sessions issues unpredictable server-side IDs (uuid4 hex)."""
    resp = client.post("/api/sessions")
    sid = resp.json()["id"]
    assert len(sid) >= 32
    assert all(c in "0123456789abcdef" for c in sid)


def test_ws_rejects_invalid_session_id_without_connecting():
    got_connected = False
    try:
        with client.websocket_connect("/ws/transcribe/bad*id") as ws:
            msg = ws.receive_json()
            got_connected = msg.get("type") == "connected"
    except Exception:
        pass
    assert not got_connected, "Server must not accept sockets for invalid session ids"


def test_ws_rejects_unknown_session_id():
    """Sessions must be created via REST first — clients cannot invent IDs."""
    got_connected = False
    try:
        with client.websocket_connect("/ws/transcribe/never_created_session") as ws:
            msg = ws.receive_json()
            got_connected = msg.get("type") == "connected"
    except Exception:
        pass
    assert not got_connected, "Server must reject sockets for sessions that were never created"


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
    import asyncio
    asyncio.run(acc.cleanup())


def test_duration_limit_seconds_derived_from_config():
    acc = AudioAccumulator("dur_test_session")
    assert acc.duration_limit_seconds == settings.max_session_minutes * 60
    import asyncio
    asyncio.run(acc.cleanup())


def test_audio_retention_removes_expired_wav(monkeypatch):
    """WAV files older than audio_retention_days are deleted by the sweep."""
    monkeypatch.setattr(settings, "audio_retention_days", 1)
    os.makedirs(settings.audio_dir, exist_ok=True)
    sid = "audio_retention_test"
    audio_path = os.path.join(settings.audio_dir, f"{sid}.wav")
    with open(audio_path, "wb") as f:
        f.write(b"RIFF-dummy-audio-for-retention-test")
    old = time.time() - 5 * 86400
    os.utime(audio_path, (old, old))

    session_manager._last_retention_sweep = 0.0  # defeat the 60s throttle
    session_manager.list_all()
    assert not os.path.exists(audio_path), "Expired session audio must be removed"


def test_fresh_audio_survives_retention_sweep(monkeypatch):
    monkeypatch.setattr(settings, "audio_retention_days", 30)
    os.makedirs(settings.audio_dir, exist_ok=True)
    sid = "audio_keep_test"
    audio_path = os.path.join(settings.audio_dir, f"{sid}.wav")
    with open(audio_path, "wb") as f:
        f.write(b"RIFF-fresh-audio")

    session_manager._last_retention_sweep = 0.0
    session_manager.list_all()
    assert os.path.exists(audio_path), "Fresh audio must not be removed"
    os.remove(audio_path)


def test_session_retention_removes_expired_sessions(monkeypatch):
    """Idle sessions older than session_retention_days are dropped from memory+SQLite."""
    monkeypatch.setattr(settings, "session_retention_days", 1)
    sid = "session_retention_test"
    session_manager.get_or_create(sid)
    # Backdate the SQLite updated_at column past the retention window
    store = session_manager._store
    with store._lock:
        store._conn.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (time.time() - 5 * 86400, sid),
        )
        store._conn.commit()

    session_manager._last_retention_sweep = 0.0
    remaining = [s.id for s in session_manager.list_all()]
    assert sid not in remaining
    # And it is gone from the durable store too
    assert store.updated_at(sid) is None


def test_retention_zero_keeps_sessions(monkeypatch):
    """Default configuration (session_retention_days=0) never deletes sessions."""
    monkeypatch.setattr(settings, "session_retention_days", 0)
    sid = "session_keep_forever"
    session_manager.get_or_create(sid)
    store = session_manager._store
    with store._lock:
        store._conn.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?",
            (time.time() - 365 * 86400, sid),
        )
        store._conn.commit()

    session_manager._last_retention_sweep = 0.0
    remaining = [s.id for s in session_manager.list_all()]
    assert sid in remaining
    session_manager.delete(sid)


def test_ws_enforces_max_session_duration(monkeypatch):
    """Server-side duration cap forces a stop on the live path (dead-config fix)."""
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr(settings, "mock_mode_if_no_key", True)
    from app.services.audio_recorder import AudioAccumulator as Acc

    # Shrink the limit to 1 second so a single chunk breaches it
    monkeypatch.setattr(Acc, "duration_limit_seconds", 1)

    created = client.post("/api/sessions").json()
    sid = created["id"]
    with client.websocket_connect(f"/ws/transcribe/{sid}") as ws:
        assert ws.receive_json()["type"] == "connected"
        ws.send_json({"type": "start", "session_id": sid, "language_mode": "auto"})

        # 1 second of 16kHz mono PCM -> duration_seconds >= 1 -> limit hit
        ws.send_bytes(b"\x00\x00" * 16000)

        event_types = []
        for _ in range(60):
            msg = ws.receive_json()
            event_types.append(msg["type"])
            if msg["type"] in ("complete", "error"):
                break

        assert "session_limit" in event_types
        assert "complete" in event_types
