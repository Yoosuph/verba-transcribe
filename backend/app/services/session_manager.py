import logging
import os
import threading
import time
import uuid
from typing import Dict, Optional, List
from app.config import settings
from app.models.transcription import (
    SessionState,
    LiveTranscriptItem,
    FinalTranscriptData,
    MeetingSummary,
    TranscriptSegment,
    ActionItem,
    CaseInformation,
    HearingParties,
    JudicialHearingReport
)

logger = logging.getLogger(__name__)

class SessionManager:
    """In-memory session registry for real-time and post-recording transcription states."""

    SESSION_TTL_SECONDS = max(settings.max_session_minutes * 60 * 2, 6 * 3600)  # at least 6h retention

    def __init__(self):
        self._sessions: Dict[str, SessionState] = {}
        self._lock = threading.RLock()
        # Monotonic creation timestamps for TTL-based eviction of stale sessions
        self._created_at: Dict[str, float] = {}

    def _evict_expired(self) -> None:
        """Drops sessions idle beyond the retention window and their audio files (caller holds lock)."""
        now = time.monotonic()
        expired = [
            sid for sid, created in self._created_at.items()
            if now - created > self.SESSION_TTL_SECONDS
        ]
        for sid in expired:
            self._sessions.pop(sid, None)
            self._created_at.pop(sid, None)
            audio_path = os.path.join(settings.temp_audio_dir, f"{sid}.wav")
            try:
                if os.path.exists(audio_path):
                    os.remove(audio_path)
            except OSError as e:
                logger.warning("Failed removing expired session audio %s: %s", audio_path, e)
        if expired:
            logger.info("Evicted %d expired session(s).", len(expired))

    def _enrich_session(self, session: SessionState) -> SessionState:
        if session:
            audio_path = os.path.join(settings.temp_audio_dir, f"{session.id}.wav")
            if os.path.exists(audio_path) and os.path.getsize(audio_path) >= 44:
                session.has_audio = True
                session.audio_url = f"/api/sessions/{session.id}/audio"
        return session

    def list_all(self) -> List[SessionState]:
        with self._lock:
            self._evict_expired()
            return [self._enrich_session(s) for s in self._sessions.values()]


    def get_or_create(self, session_id: Optional[str] = None, language_mode: str = "auto") -> SessionState:
        sid = session_id or str(uuid.uuid4())
        with self._lock:
            self._evict_expired()
            if sid not in self._sessions:
                self._created_at[sid] = time.monotonic()
                default_case = CaseInformation()
                default_parties = HearingParties()
                self._sessions[sid] = SessionState(
                    id=sid,
                    title=f"{default_case.case_number} · {default_case.court}",
                    status="idle",
                    language_mode=language_mode,
                    started_at=None,
                    ended_at=None,
                    live_transcript=[],
                    final_transcript=None,
                    summary=None,
                    case_info=default_case,
                    parties=default_parties,
                    hearing_report=None,
                    speaker_names={},
                    has_audio=False,
                    audio_url=None
                )
            session = self._sessions[sid]
            return self._enrich_session(session)

    def get(self, session_id: str) -> Optional[SessionState]:
        with self._lock:
            session = self._sessions.get(session_id)
            return self._enrich_session(session) if session else None

    def _touch(self, session_id: str) -> None:
        """Refreshes the session's TTL clock (caller holds lock)."""
        if session_id in self._sessions:
            self._created_at[session_id] = time.monotonic()

    def start_recording(self, session_id: str, language_mode: str = "auto") -> SessionState:
        with self._lock:
            session = self.get_or_create(session_id, language_mode=language_mode)
            self._touch(session_id)
            session.status = "recording"
            session.started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            session.language_mode = language_mode
            session.error_message = None
            return session

    def add_live_interim(self, session_id: str, text: str) -> None:
        with self._lock:
            self._touch(session_id)
            session = self._sessions.get(session_id)
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
        with self._lock:
            self._touch(session_id)
            session = self._sessions.get(session_id)
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
        with self._lock:
            session = self.get(session_id)
            if session:
                session.status = "processing"
                session.ended_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    def set_final_transcript(self, session_id: str, data: FinalTranscriptData) -> None:
        with self._lock:
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

    def set_translated_transcript(self, session_id: str, data: FinalTranscriptData) -> None:
        """Stores the English translation separately, preserving the authoritative original transcript."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return
            session.translated_transcript = data

    def set_summary(self, session_id: str, summary: MeetingSummary) -> None:
        with self._lock:
            session = self.get(session_id)
            if not session:
                return
            session.summary = summary
            session.status = "complete"

            # Apply speaker name overrides to summary
            if session.speaker_names:
                self._apply_speaker_names_to_summary(session)

    def rename_speaker(self, session_id: str, old_name: str, new_name: str) -> Optional[SessionState]:
        with self._lock:
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
        with self._lock:
            session = self.get(session_id)
            if not session or not session.summary:
                return None
            for item in session.summary.action_items:
                if item.id == action_id:
                    item.completed = completed
                    return item
            return None

    def set_error(self, session_id: str, error_message: str) -> None:
        with self._lock:
            session = self.get(session_id)
            if session:
                session.status = "error"
                session.error_message = error_message

    def update_case_info(
        self,
        session_id: str,
        case_info: Optional[CaseInformation] = None,
        parties: Optional[HearingParties] = None
    ) -> Optional[SessionState]:
        with self._lock:
            session = self.get(session_id)
            if not session:
                return None
            if case_info is not None:
                session.case_info = case_info
                if case_info.case_number:
                    session.title = f"{case_info.case_number} · {case_info.court}"
            if parties is not None:
                session.parties = parties
            return session

    def set_report_generating(self, session_id: str) -> Optional[SessionState]:
        """Marks report generation as in progress (idempotent; safe to call again)."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None
            self._touch(session_id)
            session.report_status = "generating"
            return session

    def set_report_error(self, session_id: str, error_message: str) -> Optional[SessionState]:
        """Marks report generation as failed, keeping any previously generated report intact."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None
            self._touch(session_id)
            session.report_status = "error"
            session.error_message = error_message
            return session

    def set_hearing_report(self, session_id: str, report: JudicialHearingReport) -> Optional[SessionState]:
        with self._lock:
            session = self.get(session_id)
            if not session:
                return None
            session.hearing_report = report
            session.report_status = "ready"
            if report.case:
                session.case_info = report.case
                session.title = f"{report.case.case_number} · {report.case.court}"
            if report.parties:
                session.parties = report.parties
            return session

session_manager = SessionManager()
