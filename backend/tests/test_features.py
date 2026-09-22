"""Feature-endpoint tests: transcript edit, bookmarks, share links, search,
tags/agenda, QA history, ICS, backup zip, and auth."""
import io
import zipfile

from fastapi.testclient import TestClient

from app.main import app
from app.services.session_manager import session_manager
from app.models.transcription import FinalTranscriptData, TranscriptSegment, MeetingSummary

client = TestClient(app)


def _create_session() -> str:
    resp = client.post("/api/sessions")
    assert resp.status_code == 200
    return resp.json()["id"]


def _with_transcript(sid: str) -> None:
    session_manager.set_final_transcript(
        sid,
        FinalTranscriptData(
            language="en",
            segments=[
                TranscriptSegment(id="seg_1", speaker="Speaker 1", start=0.0, end=3.0,
                                  text="We agree to approve the budget today."),
                TranscriptSegment(id="seg_2", speaker="Speaker 2", start=3.0, end=6.0,
                                  text="Yusuf will circulate the minutes by Friday."),
            ],
        ),
    )


def test_patch_updates_tags_and_agenda():
    sid = _create_session()
    resp = client.patch(
        f"/api/sessions/{sid}",
        json={"tags": ["finance", "weekly"], "agenda": "Budget review", "template": "standup"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["tags"] == ["finance", "weekly"]
    assert body["agenda"] == "Budget review"
    assert body["template"] == "standup"
    session_manager.delete(sid)


def test_patch_requires_at_least_one_field():
    sid = _create_session()
    resp = client.patch(f"/api/sessions/{sid}", json={})
    assert resp.status_code == 422
    session_manager.delete(sid)


def test_edit_transcript_segment():
    sid = _create_session()
    _with_transcript(sid)
    resp = client.patch(
        f"/api/sessions/{sid}/transcript/seg_2",
        json={"text": "Yusuf will circulate the minutes by Thursday.", "speaker": "Yusuf"},
    )
    assert resp.status_code == 200
    segs = resp.json()["final_transcript"]["segments"]
    edited = next(s for s in segs if s["id"] == "seg_2")
    assert edited["text"] == "Yusuf will circulate the minutes by Thursday."
    assert edited["speaker"] == "Yusuf"
    session_manager.delete(sid)


def test_edit_transcript_unknown_segment_404():
    sid = _create_session()
    _with_transcript(sid)
    resp = client.patch(f"/api/sessions/{sid}/transcript/nope", json={"text": "x"})
    assert resp.status_code == 404
    session_manager.delete(sid)


def test_bookmarks_crud():
    sid = _create_session()
    _with_transcript(sid)
    resp = client.post(
        f"/api/sessions/{sid}/bookmarks",
        json={"segment_id": "seg_1", "time_seconds": 1.5, "note": "Key decision"},
    )
    assert resp.status_code == 200
    bm = resp.json()
    assert bm["note"] == "Key decision"
    assert bm["id"].startswith("bm_")

    session = client.get(f"/api/sessions/{sid}").json()
    assert len(session["bookmarks"]) == 1

    resp = client.delete(f"/api/sessions/{sid}/bookmarks/{bm['id']}")
    assert resp.status_code == 204
    session = client.get(f"/api/sessions/{sid}").json()
    assert session["bookmarks"] == []
    session_manager.delete(sid)


def test_share_link_create_and_read_only_access(monkeypatch):
    from app.config import settings

    sid = _create_session()
    _with_transcript(sid)
    resp = client.post(f"/api/sessions/{sid}/share", json={"ttl_hours": 24})
    assert resp.status_code == 200
    token = resp.json()["share_token"]
    assert token

    # Enable auth: share token alone may READ this session
    monkeypatch.setattr(settings, "auth_token", "test-secret")
    resp = client.get(f"/api/sessions/{sid}?share={token}")
    assert resp.status_code == 200

    # ...but may not mutate
    resp = client.patch(
        f"/api/sessions/{sid}?share={token}", json={"title": "Hacked"}
    )
    assert resp.status_code in (401, 403)

    # No token at all → 401
    resp = client.get(f"/api/sessions/{sid}")
    assert resp.status_code == 401

    # Revoke (master token) → share stops working
    resp = client.delete(
        f"/api/sessions/{sid}/share", headers={"Authorization": "Bearer test-secret"}
    )
    assert resp.status_code == 200
    resp = client.get(f"/api/sessions/{sid}?share={token}")
    assert resp.status_code == 401
    monkeypatch.setattr(settings, "auth_token", "")
    session_manager.delete(sid)


def test_full_text_search_matches_transcript():
    sid = _create_session()
    _with_transcript(sid)
    session_manager.set_title(sid, "Weekly Budget Sync")
    resp = client.get("/api/search", params={"q": "circulate"})
    assert resp.status_code == 200
    assert sid in [s["id"] for s in resp.json()]

    resp = client.get("/api/search", params={"q": "Budget Sync"})
    assert sid in [s["id"] for s in resp.json()]
    session_manager.delete(sid)


def test_search_rejects_too_short_query():
    resp = client.get("/api/search", params={"q": "a"})
    assert resp.status_code == 422


def test_ask_persists_qa_history():
    sid = _create_session()
    _with_transcript(sid)
    resp = client.post(
        f"/api/sessions/{sid}/ask", json={"question": "What was agreed about the budget?"}
    )
    assert resp.status_code == 200
    assert resp.json()["answer"]
    session = client.get(f"/api/sessions/{sid}").json()
    assert len(session["qa_history"]) == 1
    assert session["qa_history"][0]["question"].startswith("What was agreed")
    session_manager.delete(sid)


def test_ics_export():
    sid = _create_session()
    session_manager.set_title(sid, "Sprint Planning")
    resp = client.get(f"/api/sessions/{sid}/ics")
    assert resp.status_code == 200
    assert "text/calendar" in resp.headers["content-type"]
    assert "BEGIN:VEVENT" in resp.text
    assert "Sprint Planning" in resp.text
    session_manager.delete(sid)


def test_export_all_zip():
    sid = _create_session()
    resp = client.get("/api/export/all")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = zf.namelist()
    assert "sessions.json" in names
    assert "README.txt" in names
    session_manager.delete(sid)


def test_login_and_me():
    # Wrong password
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401
    # Right password (bootstrapped admin/admin in the test DB)
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    # With auth disabled the master path reports the generic owner identity;
    # with auth enabled the cookie identity ("admin") is returned.
    assert resp.json()["role"] == "admin"
    client.post("/api/auth/logout")


def test_create_user_requires_admin_and_validates():
    resp = client.post(
        "/api/auth/users",
        json={"username": "alice", "password": "secret123", "role": "viewer"},
    )
    assert resp.status_code == 201
    # Duplicate
    resp = client.post(
        "/api/auth/users",
        json={"username": "alice", "password": "secret123", "role": "viewer"},
    )
    assert resp.status_code == 409
    # Short password rejected by schema
    resp = client.post(
        "/api/auth/users", json={"username": "bob", "password": "short", "role": "editor"}
    )
    assert resp.status_code == 422


def test_viewer_role_cannot_mutate(monkeypatch):
    """Cookie-authenticated viewers are blocked from mutating endpoints."""
    from app.config import settings
    from app.services.user_store import issue_session_cookie, user_store

    monkeypatch.setattr(settings, "auth_token", "test-secret")
    # Create session with master token
    resp = client.post("/api/sessions", headers={"Authorization": "Bearer test-secret"})
    assert resp.status_code == 200
    sid = resp.json()["id"]

    user_store.create("veewx", "password1", "viewer")
    cookie = issue_session_cookie("veewx", "viewer")
    resp = client.patch(
        f"/api/sessions/{sid}",
        json={"title": "Nope"},
        cookies={"scribe_session": cookie},
    )
    assert resp.status_code == 403

    # Viewer CAN read
    resp = client.get(f"/api/sessions/{sid}", cookies={"scribe_session": cookie})
    assert resp.status_code == 200

    monkeypatch.setattr(settings, "auth_token", "")
    session_manager.delete(sid)
