import logging
import os
import secrets
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional, List, Tuple

from app.config import settings, is_valid_session_id
from app.models.transcription import (
    SessionState,
    LiveTranscriptItem,
    FinalTranscriptData,
    MeetingSummary,
    TranscriptSegment,
    ActionItem,
    Bookmark,
    QAEntry,
)
from app.services.session_store import SessionStore

logger = logging.getLogger(__name__)

_SECONDS_PER_DAY = 86400

# Audio files may come from mic capture (.wav) or user import (mp3/m4a/...)
_AUDIO_EXTS = (".wav", ".mp3", ".m4a", ".ogg", ".flac", ".mp4", ".mpeg")


def audio_path_for(session_id: str) -> Optional[str]:
    """Locates the stored audio file for a session (any supported extension)."""
    for ext in _AUDIO_EXTS:
        path = os.path.join(settings.audio_dir, f"{session_id}{ext}")
        if os.path.exists(path):
            size = os.path.getsize(path)
            if ext == ".wav":
                if size >= 44:
                    return path
            elif size > 0:
                return path
    return None


class SessionManager:
    """In-memory session registry with SQLite write-through persistence.

    Sessions survive process restarts. Retention:
      - session_retention_days > 0  -> idle non-active sessions older than N days are dropped
      - audio_retention_days   > 0  -> recorded WAV files older than N days are deleted
      - 0 means keep forever
    """

    def __init__(self, store: Optional[SessionStore] = None):
        self._sessions: Dict[str, SessionState] = {}
        self._lock = threading.RLock()
        self._store = store or SessionStore()
        self._hydrate()
        self._last_retention_sweep = 0.0

    # ------------------------------------------------------------------ store
    def _hydrate(self) -> None:
        try:
            loaded = self._store.load_all()
            # Reaper: sessions persisted as recording/processing can only be live
            # in the process that wrote them. After a restart they are stuck forever
            # (and would be undeletable due to the active-status DELETE guard).
            interrupted = False
            for session in loaded.values():
                if session.status in ("recording", "processing"):
                    session.status = "error"
                    session.error_message = (
                        "Interrupted by a server restart before processing finished. "
                        "You can delete this recording or re-upload the audio."
                    )
                    self._store.save(session)
                    interrupted = True
            self._sessions.update(loaded)
            if loaded:
                logger.info("Hydrated %d session(s) from SQLite.", len(loaded))
            if interrupted:
                logger.info("Reaped sessions stuck in recording/processing after restart.")
        except Exception as e:
            logger.error("Failed to hydrate sessions from SQLite: %s", e)

    def _persist(self, session: SessionState) -> None:
        try:
            self._store.save(session)
        except Exception as e:
            logger.error("Failed persisting session %s: %s", session.id, e)

    def _evict_expired(self) -> None:
        """Retention sweep (caller holds lock). Never touches active recordings."""
        now = time.time()

        # Throttle: at most once a minute
        if now - self._last_retention_sweep < 60:
            return
        self._last_retention_sweep = now

        # --- sessions ---
        if settings.session_retention_days > 0:
            cutoff = now - settings.session_retention_days * _SECONDS_PER_DAY
            for sid, updated_at in self._store.all_ids_with_updated_at():
                session = self._sessions.get(sid)
                if session and session.status in ("recording", "processing"):
                    continue
                if updated_at < cutoff:
                    self._sessions.pop(sid, None)
                    self._store.delete(sid)
                    logger.info("Retention: removed session %s (older than %d days).",
                                sid, settings.session_retention_days)

        # --- audio files ---
        if settings.audio_retention_days > 0:
            audio_cutoff = now - settings.audio_retention_days * _SECONDS_PER_DAY
            try:
                os.makedirs(settings.audio_dir, exist_ok=True)
                for name in os.listdir(settings.audio_dir):
                    if not name.endswith(".wav"):
                        continue
                    path = os.path.join(settings.audio_dir, name)
                    try:
                        if os.path.getmtime(path) < audio_cutoff:
                            os.remove(path)
                            sid = name[:-4]
                            if sid in self._sessions:
                                self._sessions[sid].has_audio = False
                                self._sessions[sid].audio_url = None
                                self._persist(self._sessions[sid])
                            logger.info("Retention: removed audio %s (older than %d days).",
                                        name, settings.audio_retention_days)
                    except OSError as e:
                        logger.warning("Failed removing expired audio %s: %s", path, e)
            except OSError as e:
                logger.warning("Audio retention sweep failed: %s", e)

    def _enrich_session(self, session: SessionState) -> SessionState:
        if session:
            audio_path = audio_path_for(session.id)
            if audio_path:
                session.has_audio = True
                session.audio_url = f"/api/sessions/{session.id}/audio"
            else:
                session.has_audio = False
                session.audio_url = None
        return session

    # ------------------------------------------------------------------ CRUD
    def list_all(self) -> List[SessionState]:
        with self._lock:
            self._evict_expired()
            return [self._enrich_session(s) for s in self._sessions.values()]

    def create(self, language_mode: str = "auto") -> SessionState:
        """Creates a session with a server-generated ID (clients cannot pick IDs)."""
        sid = uuid.uuid4().hex
        return self.get_or_create(sid, language_mode=language_mode)

    def get_or_create(self, session_id: Optional[str] = None, language_mode: str = "auto") -> SessionState:
        sid = session_id or uuid.uuid4().hex
        if not is_valid_session_id(sid):
            raise ValueError("Invalid session id")
        with self._lock:
            if sid not in self._sessions:
                session = SessionState(
                    id=sid,
                    title="New Meeting",
                    status="idle",
                    language_mode=language_mode,
                    started_at=None,
                    ended_at=None,
                    live_transcript=[],
                    final_transcript=None,
                    summary=None,
                    speaker_names={},
                    has_audio=False,
                    audio_url=None,
                )
                self._sessions[sid] = session
                self._persist(session)
            return self._enrich_session(self._sessions[sid])

    def get(self, session_id: str) -> Optional[SessionState]:
        with self._lock:
            session = self._sessions.get(session_id)
            return self._enrich_session(session) if session else None

    def exists(self, session_id: str) -> bool:
        with self._lock:
            return session_id in self._sessions

    def _touch(self, session_id: str) -> None:
        pass  # updated_at is refreshed by _persist on every mutation

    # ------------------------------------------------------------- transitions
    def start_recording(self, session_id: str, language_mode: str = "auto") -> SessionState:
        with self._lock:
            session = self.get_or_create(session_id, language_mode=language_mode)
            session.status = "recording"
            session.started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            session.language_mode = language_mode
            session.error_message = None
            if session.title in ("New Meeting", "New Recording"):
                session.title = f"Meeting · {time.strftime('%Y-%m-%d %H:%M')}"
            self._persist(session)
            return session

    def add_live_interim(self, session_id: str, text: str) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return
            # If last item is interim, update it, else append
            if session.live_transcript and not session.live_transcript[-1].is_final:
                session.live_transcript[-1].text = text
            else:
                session.live_transcript.append(
                    LiveTranscriptItem(
                        id=f"live_{len(session.live_transcript) + 1}",
                        text=text,
                        is_final=False,
                        timestamp_ms=int(time.time() * 1000),
                    )
                )
            self._persist(session)

    def add_live_final(self, session_id: str, text: str, speaker: Optional[str] = None) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return
            # If last item is interim, replace it with final
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
                        speaker_label=speaker,
                    )
                )
            self._persist(session)

    def get_live_transcript_text(self, session_id: str) -> str:
        session = self.get(session_id)
        if not session or not session.live_transcript:
            return ""
        return " ".join(
            item.text.strip() for item in session.live_transcript if item.text and item.text.strip()
        )

    def set_processing(self, session_id: str) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.status = "processing"
                session.ended_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                if session.title in ("New Meeting", "New Recording"):
                    session.title = f"Meeting · {time.strftime('%Y-%m-%d %H:%M')}"
                self._persist(session)

    def set_final_transcript(self, session_id: str, data: FinalTranscriptData) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return
            session.final_transcript = data
            session.detected_language = data.language

            # Apply any existing speaker name overrides
            if session.speaker_names:
                for seg in session.final_transcript.segments:
                    if seg.speaker in session.speaker_names:
                        seg.speaker = session.speaker_names[seg.speaker]
            self._persist(session)

    def set_translated_transcript(self, session_id: str, data: FinalTranscriptData) -> None:
        """Stores the English translation separately, preserving the authoritative original transcript."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return
            session.translated_transcript = data
            self._persist(session)

    @staticmethod
    def _derive_title(summary: "MeetingSummary") -> str:
        """First sentence of the executive summary, capped at ~80 chars."""
        text = (summary.executive_summary or "").strip()
        if not text:
            return ""
        for sep in (". ", "? ", "! "):
            idx = text.find(sep)
            if idx > 10:
                text = text[: idx + 1]
                break
        text = text.rstrip(".!?; ").strip()
        if len(text) > 80:
            text = text[:77].rsplit(" ", 1)[0] + "…"
        return text

    def set_summary(self, session_id: str, summary: MeetingSummary) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return
            session.summary = summary
            session.status = "complete"
            # Only auto-title placeholder/derived names; keep a user's custom title.
            if session.title in (None, "", "New Meeting", "New Recording") or (
                session.title and session.title.startswith("Meeting · ")
            ):
                derived = self._derive_title(summary)
                if derived:
                    session.title = derived

            # Apply speaker name overrides to summary
            if session.speaker_names:
                self._apply_speaker_names_to_summary(session)
            self._persist(session)

    def set_title(self, session_id: str, title: str) -> Optional[SessionState]:
        """User-initiated rename of a meeting."""
        cleaned = (title or "").strip()
        if not cleaned:
            return None
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None
            session.title = cleaned[:200]
            self._persist(session)
            return session

    def update_meta(
        self,
        session_id: str,
        *,
        title: Optional[str] = None,
        tags: Optional[List[str]] = None,
        agenda: Optional[str] = None,
        template: Optional[str] = None,
    ) -> Optional[SessionState]:
        """Partial update of editable meeting metadata."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None
            if title is not None:
                cleaned = title.strip()
                if not cleaned:
                    return None
                session.title = cleaned[:200]
            if tags is not None:
                session.tags = [t.strip()[:40] for t in tags if t.strip()][:20]
            if agenda is not None:
                session.agenda = agenda.strip()[:4000] or None
            if template is not None:
                session.template = template.strip()[:64] or None
            self._persist(session)
            return session

    def edit_segment(
        self,
        session_id: str,
        segment_id: str,
        *,
        text: Optional[str] = None,
        speaker: Optional[str] = None,
    ) -> Optional[SessionState]:
        """Manual transcript correction on a single segment."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session or not session.final_transcript:
                return None
            for seg in session.final_transcript.segments:
                if seg.id == segment_id:
                    if text is not None and text.strip():
                        seg.text = text.strip()
                    if speaker is not None and speaker.strip():
                        seg.speaker = speaker.strip()
                    self._persist(session)
                    return session
            return None

    def add_bookmark(
        self,
        session_id: str,
        *,
        segment_id: Optional[str] = None,
        time_seconds: float = 0.0,
        note: str = "",
    ) -> Optional[Bookmark]:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None
            bookmark = Bookmark(
                id=f"bm_{uuid.uuid4().hex[:10]}",
                segment_id=segment_id,
                time_seconds=max(0.0, float(time_seconds)),
                note=(note or "").strip()[:500],
                created_at=datetime.now(timezone.utc).isoformat(),
            )
            session.bookmarks.append(bookmark)
            self._persist(session)
            return bookmark

    def remove_bookmark(self, session_id: str, bookmark_id: str) -> bool:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return False
            before = len(session.bookmarks)
            session.bookmarks = [b for b in session.bookmarks if b.id != bookmark_id]
            if len(session.bookmarks) == before:
                return False
            self._persist(session)
            return True

    def add_qa(
        self,
        session_id: str,
        question: str,
        answer: str,
        evidence: Optional[List[str]] = None,
    ) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return
            session.qa_history.append(
                QAEntry(
                    question=question.strip()[:1000],
                    answer=answer.strip()[:4000],
                    evidence_segment_ids=evidence or [],
                    created_at=datetime.now(timezone.utc).isoformat(),
                )
            )
            # Cap history so the session blob cannot grow unbounded
            session.qa_history = session.qa_history[-50:]
            self._persist(session)

    def create_share(self, session_id: str, ttl_hours: int) -> Optional[Tuple[str, str]]:
        """Creates/rotates a read-only share token. Returns (token, expires_iso)."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None
            token = secrets.token_urlsafe(24)
            expires = datetime.now(timezone.utc) + timedelta(hours=ttl_hours)
            session.share_token = token
            session.share_expires_at = expires.isoformat()
            self._persist(session)
            return token, session.share_expires_at

    def revoke_share(self, session_id: str) -> bool:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return False
            session.share_token = None
            session.share_expires_at = None
            self._persist(session)
            return True

    def search(self, query: str) -> List[SessionState]:
        with self._lock:
            self._evict_expired()
            ids = set(self._store.search_ids(query))
            return [
                self._enrich_session(s)
                for sid, s in self._sessions.items()
                if sid in ids
            ]

    def rename_speaker(self, session_id: str, old_name: str, new_name: str) -> Optional[SessionState]:
        with self._lock:
            session = self._sessions.get(session_id)
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

            self._persist(session)
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
            session = self._sessions.get(session_id)
            if not session or not session.summary:
                return None
            for item in session.summary.action_items:
                if item.id == action_id:
                    item.completed = completed
                    self._persist(session)
                    return item
            return None

    def set_error(self, session_id: str, error_message: str) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.status = "error"
                session.error_message = error_message
                self._persist(session)

    def delete(self, session_id: str) -> bool:
        """Removes a session and its audio file. Returns True if the session existed."""
        with self._lock:
            existed = session_id in self._sessions
            self._sessions.pop(session_id, None)
            self._store.delete(session_id)
            for ext in _AUDIO_EXTS:
                audio_path = os.path.join(settings.audio_dir, f"{session_id}{ext}")
                try:
                    if os.path.exists(audio_path):
                        os.remove(audio_path)
                except OSError as e:
                    logger.warning("Failed removing audio for deleted session %s: %s", session_id, e)
            return existed


session_manager = SessionManager()
