import pytest
import io
import wave
from fastapi.testclient import TestClient
from app.main import app
from app.services.session_manager import session_manager
from app.services.audio_recorder import AudioAccumulator
from app.models.transcription import (
    FinalTranscriptData,
    TranscriptSegment,
    MeetingSummary,
    DecisionItem,
    ActionItem,
    SpeakerContribution
)

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "live_model" in data["models"]
    assert "final_model" in data["models"]

def test_session_lifecycle():
    # 1. Create session
    resp = client.post("/api/sessions?language_mode=ha")
    assert resp.status_code == 200
    session_data = resp.json()
    session_id = session_data["id"]
    assert session_data["language_mode"] == "ha"

    # 2. Get session
    get_resp = client.get(f"/api/sessions/{session_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == session_id

    # 3. Simulate adding final transcript and summary
    final_data = FinalTranscriptData(
        language="ha-NG",
        segments=[
            TranscriptSegment(
                id="seg_1",
                speaker="Speaker 1",
                start=0.0,
                end=4.0,
                text="Ina kwana baki daya.",
                language="ha-NG"
            ),
            TranscriptSegment(
                id="seg_2",
                speaker="Speaker 2",
                start=4.2,
                end=8.5,
                text="Lafiya lau, an gama rubuta takardar.",
                language="ha-NG"
            )
        ]
    )
    session_manager.set_final_transcript(session_id, final_data)

    summary_data = MeetingSummary(
        executive_summary="Tattaunawa kan tsarin shari'a.",
        key_points=["An mika takarda."],
        decisions=[
            DecisionItem(id="dec_1", decision="A duba maganar", evidence_segment_ids=["seg_1"])
        ],
        action_items=[
            ActionItem(id="act_1", task="Gama rubutu", assignee="Speaker 2", evidence_segment_ids=["seg_2"], completed=False)
        ],
        questions=[],
        speaker_contributions=[
            SpeakerContribution(speaker="Speaker 1", summary="Ya fara magana."),
            SpeakerContribution(speaker="Speaker 2", summary="Ya amsa tambaya.")
        ]
    )
    session_manager.set_summary(session_id, summary_data)

    # 4. Rename speaker
    rename_resp = client.post(
        f"/api/sessions/{session_id}/speakers/rename",
        json={"old_name": "Speaker 2", "new_name": "Malam Ahmed"}
    )
    assert rename_resp.status_code == 200
    updated = rename_resp.json()

    # Verify speaker name updated in final transcript segments
    assert updated["final_transcript"]["segments"][1]["speaker"] == "Malam Ahmed"
    # Verify speaker name updated in action items assignee
    assert updated["summary"]["action_items"][0]["assignee"] == "Malam Ahmed"
    # Verify speaker name updated in speaker contributions
    assert updated["summary"]["speaker_contributions"][1]["speaker"] == "Malam Ahmed"

    # 5. Toggle action item
    action_resp = client.patch(
        f"/api/sessions/{session_id}/actions/act_1",
        json={"completed": True}
    )
    assert action_resp.status_code == 200
    assert action_resp.json()["completed"] is True

    # 6. Export session
    export_md = client.get(f"/api/sessions/{session_id}/export?format=markdown")
    assert export_md.status_code == 200
    assert "Malam Ahmed" in export_md.text

    export_json = client.get(f"/api/sessions/{session_id}/export?format=json")
    assert export_json.status_code == 200
    assert export_json.json()["id"] == session_id

def test_audio_accumulator():
    accumulator = AudioAccumulator("test_session_123")
    # 1 second of 16kHz 16-bit mono = 16000 * 2 = 32000 bytes
    dummy_pcm = b"\x00\x00" * 16000
    accumulator.append_pcm(dummy_pcm)

    assert accumulator.total_bytes == 32000
    assert abs(accumulator.duration_seconds - 1.0) < 0.001

    wav_bytes = accumulator.get_wav_bytes()
    assert len(wav_bytes) > 32000
    # Validate standard WAV header
    wav_io = io.BytesIO(wav_bytes)
    with wave.open(wav_io, "rb") as wf:
        assert wf.getnchannels() == 1
        assert wf.getsampwidth() == 2
        assert wf.getframerate() == 16000
        assert wf.getnframes() == 16000

@pytest.mark.asyncio
async def test_websocket_flow():
    with client.websocket_connect("/ws/transcribe/ws_test_session") as ws:
        connected_msg = ws.receive_json()
        assert connected_msg["type"] == "connected"
        assert connected_msg["session_id"] == "ws_test_session"

        # Send start
        ws.send_json({"type": "start", "session_id": "ws_test_session", "language_mode": "auto"})

        # Send some dummy 16kHz PCM chunks
        chunk = b"\x00\x00" * 320  # 20ms chunk
        ws.send_bytes(chunk)

        # Send stop
        ws.send_json({"type": "stop"})

        # Collect events
        event_types = []
        while True:
            msg = ws.receive_json()
            event_types.append(msg["type"])
            if msg["type"] == "complete":
                break

        assert "processing" in event_types
        assert "final_transcript" in event_types
        assert "summary" in event_types
        assert "complete" in event_types
