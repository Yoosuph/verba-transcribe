import time
import uuid
from typing import Dict, Optional, List
from app.models.transcription import (
    SessionState,
    LiveTranscriptItem,
    FinalTranscriptData,
    MeetingSummary,
    TranscriptSegment,
    ActionItem
)

class SessionManager:
    """In-memory session registry for real-time and post-recording transcription states."""
    def __init__(self):
        self._sessions: Dict[str, SessionState] = {}

    def list_all(self) -> List[SessionState]:
        return list(self._sessions.values())


    def get_or_create(self, session_id: Optional[str] = None, language_mode: str = "auto") -> SessionState:
        sid = session_id or str(uuid.uuid4())
        if sid not in self._sessions:
            self._sessions[sid] = SessionState(
                id=sid,
                title="New Recording",
                status="idle",
                language_mode=language_mode,
                started_at=None,
                ended_at=None,
                live_transcript=[],
                final_transcript=None,
                summary=None,
                speaker_names={}
            )
        return self._sessions[sid]

    def get(self, session_id: str) -> Optional[SessionState]:
        return self._sessions.get(session_id)


    def start_recording(self, session_id: str, language_mode: str = "auto") -> SessionState:
        session = self.get_or_create(session_id, language_mode=language_mode)
        session.status = "recording"
        session.started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        session.language_mode = language_mode
        session.error_message = None
        return session

    def add_live_interim(self, session_id: str, text: str) -> None:
        session = self.get(session_id)
        if not session:
            return
        # If last item was interim, update it, else append
        if session.live_transcript and not session.live_transcript[-1].is_final:
            session.live_transcript[-1].text = text
        else:
            session.live_transcript.append(
                LiveTranscriptItem(
                    id=f"live_{len(session.live_transcript) + 1}",
                    text=text,
                    is_final=False,
                    timestamp_ms=int(time.time() * 1000)
                )
            )

    def add_live_final(self, session_id: str, text: str, speaker: Optional[str] = None) -> None:
        session = self.get(session_id)
        if not session:
            return
        # If last item was interim, replace it with final
        if session.live_transcript and not session.live_transcript[-1].is_final:
            session.live_transcript[-1].text = text
            session.live_transcript[-1].is_final = True
            session.live_transcript[-1].speaker_label = speaker
        else:
            session.live_transcript.append(
                LiveTranscriptItem(
                    id=f"live_{len(session.live_transcript) + 1}",
                    text=text,
                    is_final=True,
                    timestamp_ms=int(time.time() * 1000),
                    speaker_label=speaker
                )
            )

    def get_live_transcript_text(self, session_id: str) -> str:
        session = self.get(session_id)
        if not session or not session.live_transcript:
            return ""
        return " ".join(item.text.strip() for item in session.live_transcript if item.text and item.text.strip())

    def set_processing(self, session_id: str) -> None:
        session = self.get(session_id)
        if session:
            session.status = "processing"
            session.ended_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    def set_final_transcript(self, session_id: str, data: FinalTranscriptData) -> None:
        session = self.get(session_id)
        if not session:
            return
        session.final_transcript = data
        session.detected_language = data.language

        # Apply any existing speaker name overrides
        if session.speaker_names:
            for seg in session.final_transcript.segments:
                if seg.speaker in session.speaker_names:
                    seg.speaker = session.speaker_names[seg.speaker]

    def set_summary(self, session_id: str, summary: MeetingSummary) -> None:
        session = self.get(session_id)
        if not session:
            return
        session.summary = summary
        session.status = "complete"

        # Apply speaker name overrides to summary
        if session.speaker_names:
            self._apply_speaker_names_to_summary(session)

    def rename_speaker(self, session_id: str, old_name: str, new_name: str) -> Optional[SessionState]:
        session = self.get(session_id)
        if not session:
            return None
        session.speaker_names[old_name] = new_name

        # Update final transcript
        if session.final_transcript:
            for seg in session.final_transcript.segments:
                if seg.speaker == old_name:
                    seg.speaker = new_name

        # Update summary
        if session.summary:
            self._apply_speaker_names_to_summary(session)

        return session

    def _apply_speaker_names_to_summary(self, session: SessionState) -> None:
        if not session.summary:
            return
        for item in session.summary.action_items:
            if item.assignee and item.assignee in session.speaker_names:
                item.assignee = session.speaker_names[item.assignee]
        for contrib in session.summary.speaker_contributions:
            if contrib.speaker in session.speaker_names:
                contrib.speaker = session.speaker_names[contrib.speaker]

    def toggle_action_item(self, session_id: str, action_id: str, completed: bool) -> Optional[ActionItem]:
        session = self.get(session_id)
        if not session or not session.summary:
            return None
        for item in session.summary.action_items:
            if item.id == action_id:
                item.completed = completed
                return item
        return None

    def set_error(self, session_id: str, error_message: str) -> None:
        session = self.get(session_id)
        if session:
            session.status = "error"
            session.error_message = error_message

session_manager = SessionManager()
