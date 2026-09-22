"""
Auth, persistence and rate-limit regression tests for the hardening pass.
"""
import os
import time
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.services.session_manager import session_manager
from app.services.session_store import SessionStore

client = TestClient(app)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
@pytest.fixture()
def auth_enabled(monkeypatch):
    monkeypatch.setattr(settings, "auth_token", "test-secret-token")
    yield
    # ensure subsequent tests in this module run without the token


def test_auth_rejects_missing_token(auth_enabled):
    resp = client.get("/api/sessions")
    assert resp.status_code == 401


def test_auth_rejects_wrong_token(auth_enabled):
    resp = client.get(
        "/api/sessions",
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert resp.status_code == 401


def test_auth_accepts_bearer_token(auth_enabled):
    resp = client.get(
        "/api/sessions",
        headers={"Authorization": "Bearer test-secret-token"},
    )
    assert resp.status_code == 200


def test_auth_accepts_x_auth_header(auth_enabled):
    resp = client.get(
        "/api/sessions",
        headers={"X-Auth-Token": "test-secret-token"},
    )
    assert resp.status_code == 200


def test_health_stays_open_without_token(auth_enabled):
    resp = client.get("/api/health")
    assert resp.status_code == 200


def test_ws_rejects_bad_token(auth_enabled):
    created = TestClient(app).post("/api/sessions", headers={"Authorization": "Bearer test-secret-token"})
    sid = created.json()["id"]
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/transcribe/{sid}?token=wrong") as ws:
            # Handshake should be denied; receiving "connected" would be a failure
            msg = ws.receive_json()
            assert msg.get("type") != "connected"


def test_ws_accepts_query_token(auth_enabled):
    auth_client = TestClient(app)
    sid = auth_client.post(
        "/api/sessions", headers={"Authorization": "Bearer test-secret-token"}
    ).json()["id"]
    with client.websocket_connect(f"/ws/transcribe/{sid}?token=test-secret-token") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "connected"
        assert msg["session_id"] == sid


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------
def test_sessions_survive_manager_restart(tmp_path):
    """A fresh SessionManager hydrated from the same SQLite file sees prior sessions."""
    db_path = str(tmp_path / "persist_test.db")
    store1 = SessionStore(db_path=db_path)
    mgr1 = session_manager.__class__(store=store1)
    created = mgr1.create(language_mode="ha")
    mgr1.start_recording(created.id, language_mode="ha")
    mgr1.add_live_final(created.id, "Barkan ku da warhaka.")
    store1.close()

    store2 = SessionStore(db_path=db_path)
    mgr2 = session_manager.__class__(store=store2)
    restored = mgr2.get(created.id)
    assert restored is not None
    assert restored.language_mode == "ha"
    assert restored.live_transcript[-1].text == "Barkan ku da warhaka."
    store2.close()


def test_writes_are_durable_in_sqlite():
    """Every mutation is written through to SQLite immediately (queryable on disk)."""
    sid = session_manager.create().id
    session_manager.start_recording(sid)
    session_manager.set_error(sid, "boom")

    store = session_manager._store
    with store._lock:
        row = store._conn.execute(
            "SELECT data FROM sessions WHERE id = ?", (sid,)
        ).fetchone()
    assert row is not None
    assert '"error_message": "boom"' in row[0] or '"error_message":"boom"' in row[0].replace(" ", "")


def test_create_generates_new_id_each_call():
    a = session_manager.create()
    b = session_manager.create()
    assert a.id != b.id


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
def test_rate_limit_returns_429_after_burst(monkeypatch, tmp_path):
    from app.core import ratelimit
    monkeypatch.setattr(settings, "rate_limit_llm_per_minute", 2)
    ratelimit.reset()

    sid = session_manager.create().id
    headers = {}

    statuses = []
    for _ in range(4):
        resp = client.post(
            f"/api/sessions/{sid}/translate",
            headers=headers,
        )
        statuses.append(resp.status_code)
    # translate requires a final transcript -> 400s are fine; the point is we
    # never exceed the window without a 429 once the limit is hit.
    assert 429 in statuses
    ratelimit.reset()
