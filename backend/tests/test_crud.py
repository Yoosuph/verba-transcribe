"""Recording CRUD regression tests: PATCH (rename) and DELETE."""
import os

from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app.services.session_manager import session_manager
from app.models.transcription import MeetingSummary

client = TestClient(app)


def _create_session() -> dict:
    resp = client.post("/api/sessions")
    assert resp.status_code == 200
    return resp.json()


def test_patch_renames_session_title():
    sid = _create_session()["id"]
    resp = client.patch(f"/api/sessions/{sid}", json={"title": "Budget Committee Meeting"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "Budget Committee Meeting"
    # Persisted read-back
    assert client.get(f"/api/sessions/{sid}").json()["title"] == "Budget Committee Meeting"
    session_manager.delete(sid)


def test_patch_strips_whitespace_and_rejects_blank():
    sid = _create_session()["id"]
    resp = client.patch(f"/api/sessions/{sid}", json={"title": "  Padded Title  "})
    assert resp.status_code == 200
    assert resp.json()["title"] == "Padded Title"

    resp = client.patch(f"/api/sessions/{sid}", json={"title": "   "})
    assert resp.status_code in (400, 422)
    session_manager.delete(sid)


def test_patch_unknown_session_404():
    resp = client.patch("/api/sessions/doesnotexist123", json={"title": "X"})
    assert resp.status_code == 404


def test_delete_removes_session_and_audio():
    sid = _create_session()["id"]
    os.makedirs(settings.audio_dir, exist_ok=True)
    audio_path = os.path.join(settings.audio_dir, f"{sid}.wav")
    with open(audio_path, "wb") as f:
        f.write(b"RIFF-dummy")

    resp = client.delete(f"/api/sessions/{sid}")
    assert resp.status_code == 204
    assert client.get(f"/api/sessions/{sid}").status_code == 404
    assert not os.path.exists(audio_path), "Audio file must be removed with the session"


def test_delete_unknown_session_404():
    resp = client.delete("/api/sessions/neverexisted99")
    assert resp.status_code == 404


def test_delete_blocked_while_processing():
    sid = _create_session()["id"]
    session_manager.set_processing(sid)
    resp = client.delete(f"/api/sessions/{sid}")
    assert resp.status_code == 409
    # Cleanup for other tests
    session = session_manager.get(sid)
    if session:
        session.status = "complete"
    session_manager.delete(sid)


def test_user_title_survives_summary_derivation():
    """A custom title must not be overwritten when the summary arrives."""
    sid = _create_session()["id"]
    session_manager.set_title(sid, "My Custom Title")
    session_manager.set_summary(
        sid,
        MeetingSummary(executive_summary="The committee approved the quarterly budget allocation."),
    )
    assert session_manager.get(sid).title == "My Custom Title"
    session_manager.delete(sid)


def test_auto_title_still_derived_from_summary():
    """Placeholder/auto titles still get derived from the summary."""
    sid = _create_session()["id"]
    session_manager.set_summary(
        sid,
        MeetingSummary(executive_summary="The committee approved the quarterly budget allocation."),
    )
    final = session_manager.get(sid).title
    assert final == "The committee approved the quarterly budget allocation"
    session_manager.delete(sid)


def test_stuck_active_sessions_reaped_on_restart():
    """Sessions persisted as recording/processing become deletable (error) after restart."""
    from app.services.session_manager import SessionManager

    sid = "stuck_reap_test"
    session_manager.get_or_create(sid)
    session_manager.set_processing(sid)
    assert session_manager.get(sid).status == "processing"

    # Simulate a process restart over the same store
    fresh = SessionManager(store=session_manager._store)
    reaped = fresh.get(sid)
    assert reaped is not None
    assert reaped.status == "error"
    assert "restart" in (reaped.error_message or "").lower()

    # Resync the live singleton to the reaped state, then the DELETE guard passes
    session_manager.set_error(sid, reaped.error_message or "")
    resp = client.delete(f"/api/sessions/{sid}")
    assert resp.status_code == 204
    session_manager.delete(sid)
