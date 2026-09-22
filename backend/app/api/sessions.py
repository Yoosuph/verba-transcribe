import os
import io as _io
import zipfile
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Query
from fastapi.responses import Response, PlainTextResponse, FileResponse
from typing import List, Optional
from app.models.transcription import (
    SessionState,
    RenameSpeakerRequest,
    UpdateActionItemRequest,
    UpdateSessionRequest,
    EditSegmentRequest,
    CreateBookmarkRequest,
    ShareLinkRequest,
    Bookmark,
    FinalTranscriptData,
    AskRequest,
    AskResponse,
)
from app.services.session_manager import session_manager, audio_path_for
from app.services.pipeline import process_recording_bounded
from app.config import settings, is_valid_session_id
from app.core.auth import require_auth, require_editor, require_admin
from app.core.ratelimit import check_rate_limit
from google import genai
from google.genai import types
import logging
import re as _re

logger = logging.getLogger(__name__)


def validate_session_id_path(request: Request) -> None:
    """Router-level guard: rejects session IDs unsafe for URLs or file paths.
    Reads from path_params so routes without a session_id path segment pass through."""
    sid = request.path_params.get("session_id")
    if sid is not None and not is_valid_session_id(sid):
        raise HTTPException(status_code=400, detail="Invalid session id")


router = APIRouter(
    prefix="/api/sessions",
    tags=["sessions"],
    dependencies=[Depends(require_auth), Depends(validate_session_id_path)],
)

# Mutations require editor+; delete/share/export-all additionally admin? editor is enough for share.
_editor = [Depends(require_editor)]


@router.get("", response_model=List[SessionState])
async def list_sessions():
    """Lists all active and completed sessions (auth required)."""
    return session_manager.list_all()


@router.post("", response_model=SessionState, dependencies=_editor)
async def create_session(language_mode: str = Query("auto")):
    """Creates a new transcription session with a server-generated ID."""
    return session_manager.create(language_mode=language_mode)


@router.get("/{session_id}", response_model=SessionState)
async def get_session(session_id: str):
    """Retrieves current session state, transcript, and summary."""
    session = session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/{session_id}", response_model=SessionState, dependencies=_editor)
async def update_session(session_id: str, request: UpdateSessionRequest):
    """Partial update of meeting metadata: title, tags, agenda, and/or template."""
    if (
        request.title is None
        and request.tags is None
        and request.agenda is None
        and request.template is None
    ):
        raise HTTPException(status_code=422, detail="No updatable fields provided")
    if request.title is not None and not request.title.strip():
        raise HTTPException(status_code=422, detail="Title must not be empty")
    updated = session_manager.update_meta(
        session_id,
        title=request.title,
        tags=request.tags,
        agenda=request.agenda,
        template=request.template,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found")
    return updated


@router.patch("/{session_id}/transcript/{segment_id}", response_model=SessionState, dependencies=_editor)
async def edit_transcript_segment(session_id: str, segment_id: str, request: EditSegmentRequest):
    """Manual correction of a transcript segment (text and/or speaker)."""
    if request.text is None and request.speaker is None:
        raise HTTPException(status_code=422, detail="Nothing to edit")
    updated = session_manager.edit_segment(
        session_id, segment_id, text=request.text, speaker=request.speaker
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Session or segment not found")
    return updated


@router.post("/{session_id}/bookmarks", response_model=Bookmark, dependencies=_editor)
async def create_bookmark(session_id: str, request: CreateBookmarkRequest):
    """Adds a timestamped highlight/bookmark to the meeting."""
    bookmark = session_manager.add_bookmark(
        session_id,
        segment_id=request.segment_id,
        time_seconds=request.time_seconds,
        note=request.note,
    )
    if not bookmark:
        raise HTTPException(status_code=404, detail="Session not found")
    return bookmark


@router.delete("/{session_id}/bookmarks/{bookmark_id}", status_code=204, dependencies=_editor)
async def delete_bookmark(session_id: str, bookmark_id: str):
    if not session_manager.remove_bookmark(session_id, bookmark_id):
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return Response(status_code=204)


@router.post("/{session_id}/share", dependencies=_editor)
async def create_share_link(session_id: str, request: ShareLinkRequest):
    """Creates (or rotates) a read-only share link for this meeting."""
    result = session_manager.create_share(session_id, request.ttl_hours)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    token, expires = result
    return {"share_token": token, "expires_at": expires}


@router.delete("/{session_id}/share", dependencies=_editor)
async def revoke_share_link(session_id: str):
    if not session_manager.revoke_share(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"revoked": True}


@router.delete("/{session_id}", status_code=204, dependencies=_editor)
async def delete_session(session_id: str):
    """Permanently deletes a session, its persisted record, and its audio file."""
    session = session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status in ("recording", "processing"):
        raise HTTPException(status_code=409, detail="Cannot delete a session while it is active")
    session_manager.delete(session_id)
    return Response(status_code=204)


# ------------------------- search / library-level -------------------------

search_router = APIRouter(tags=["search"], dependencies=[Depends(require_auth)])


@search_router.get("/api/search", response_model=List[SessionState])
async def search_sessions(q: str = Query(..., min_length=2, max_length=200)):
    """Full-text search across titles, summaries, transcripts, tags, and agendas."""
    return session_manager.search(q.strip())


@search_router.get("/api/export/all")
async def export_all(request: Request, _: None = Depends(require_editor)):
    """Downloads a backup zip: all sessions as JSON plus every audio file."""
    sessions = session_manager.list_all()
    buf = _io.BytesIO()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "sessions.json",
            "\n".join(s.model_dump_json() for s in sessions),
        )
        for s in sessions:
            path = audio_path_for(s.id)
            if path:
                zf.write(path, arcname=f"audio/{os.path.basename(path)}")
        zf.writestr(
            "README.txt",
            "Scribe backup.\n"
            "sessions.json: one SessionState JSON object per line.\n"
            "audio/: recordings (restore by placing files back in data/audio).",
        )
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="scribe-backup-{stamp}.zip"'},
    )


@router.post("/{session_id}/speakers/rename", response_model=SessionState, dependencies=_editor)
async def rename_speaker(session_id: str, request: RenameSpeakerRequest):
    """Renames a generic speaker label (e.g. 'Speaker 1' -> 'Yusuf') across transcripts and summaries."""
    updated = session_manager.rename_speaker(session_id, request.old_name, request.new_name)
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found")
    return updated


@router.patch("/{session_id}/actions/{action_id}", dependencies=_editor)
async def toggle_action_item(session_id: str, action_id: str, request: UpdateActionItemRequest):
    """Toggles completion status of an action item."""
    updated_item = session_manager.toggle_action_item(session_id, action_id, request.completed)
    if not updated_item:
        raise HTTPException(status_code=404, detail="Action item or session not found")
    return updated_item


@router.get("/{session_id}/audio")
async def get_session_audio(session_id: str):
    """
    Streams the recorded or uploaded audio for playback and replay.
    Supports HTTP range requests for seamless timeline seeking in browser.
    """
    audio_path = audio_path_for(session_id)
    if not audio_path:
        raise HTTPException(status_code=404, detail="Audio recording not available for this session")

    media_type = "audio/wav"
    ext = os.path.splitext(audio_path)[1].lower()
    if ext == ".mp3":
        media_type = "audio/mpeg"
    elif ext in (".m4a", ".mp4"):
        media_type = "audio/mp4"
    elif ext == ".ogg":
        media_type = "audio/ogg"
    elif ext == ".flac":
        media_type = "audio/flac"

    try:
        return FileResponse(
            path=audio_path,
            media_type=media_type,
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=86400",
                "Content-Disposition": f'inline; filename="meeting_{session_id}{ext}"'
            }
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Audio recording not available for this session")


@router.post("/{session_id}/complete-audio", response_model=SessionState, dependencies=_editor)
async def process_complete_audio(
    request: Request,
    session_id: str,
    audio_file: UploadFile = File(...),
):
    """
    Direct audio upload endpoint for post-recording processing.
    Transcribes with speaker diarization and generates grounded summary.
    """
    check_rate_limit(request, bucket="complete_audio")
    session = session_manager.get_or_create(session_id)
    session_manager.set_processing(session_id)

    try:
        audio_bytes = await audio_file.read()
        max_bytes = settings.max_audio_size_mb * 1024 * 1024
        if len(audio_bytes) > max_bytes:
            session_manager.set_error(session_id, f"Audio exceeds {settings.max_audio_size_mb}MB limit")
            raise HTTPException(status_code=413, detail=f"Audio exceeds {settings.max_audio_size_mb}MB limit")

        # Save audio for playback — preserve the original extension so browsers
        # and the Files API see the real format (imported mp3/m4a, recorded wav).
        os.makedirs(settings.audio_dir, exist_ok=True)
        orig_name = (audio_file.filename or "recording.wav").lower()
        ext = os.path.splitext(orig_name)[1] or ".wav"
        if ext not in (".wav", ".mp3", ".m4a", ".ogg", ".flac", ".mp4", ".mpeg"):
            ext = ".wav"
        audio_path = os.path.join(settings.audio_dir, f"{session_id}{ext}")
        try:
            import aiofiles
            async with aiofiles.open(audio_path, "wb") as f:
                await f.write(audio_bytes)
        except Exception as e:
            logger.warning(f"[{session_id}] Failed to persist audio for replay: {e}")
            audio_path = None

        await process_recording_bounded(
            session_id,
            wav_path=audio_path,
            wav_bytes=audio_bytes if audio_path is None else None,
        )
    except HTTPException:
        raise
    except Exception as e:
        # Client aborts / read failures previously left the session stuck in
        # "processing" forever (undeletable). Always surface an error state.
        logger.error(f"[{session_id}] Processing aborted: {e}")
        session_manager.set_error(session_id, f"Processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {e}")

    session = session_manager.get(session_id)
    if session and session.status == "error":
        raise HTTPException(status_code=500, detail=f"Processing failed: {session.error_message}")
    return session


@router.post("/{session_id}/translate", dependencies=_editor)
async def translate_transcript_to_english(request: Request, session_id: str):
    """
    Optional translation feature: Translates non-English segments in the finalized transcript to English
    while preserving original speaker labels and timing.
    """
    check_rate_limit(request, bucket="translate")
    session = session_manager.get(session_id)
    if not session or not session.final_transcript:
        raise HTTPException(status_code=400, detail="Final transcript not yet available")

    if not settings.gemini_api_key:
        # Simulated translation — stored separately so the authoritative original record is preserved
        translated = session.final_transcript.model_copy(deep=True)
        for seg in translated.segments:
            if seg.language and "ha" in seg.language.lower():
                seg.text = f"[Translated from Hausa] {seg.text}"
        session_manager.set_translated_transcript(session_id, translated)
        return translated

    client = genai.Client(api_key=settings.gemini_api_key)
    prompt = f"Translate the following transcript segments accurately into English while maintaining exact meaning:\n{session.final_transcript.model_dump_json()}"

    try:
        response = await client.aio.models.generate_content(
            model=settings.gemini_summary_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=FinalTranscriptData,
                temperature=0.1,
            ),
        )
        if response and response.text:
            translated_data = FinalTranscriptData.model_validate_json(response.text)
            session_manager.set_translated_transcript(session_id, translated_data)
            return translated_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")

    return session.final_transcript


@router.post("/{session_id}/ask", response_model=AskResponse, dependencies=_editor)
async def ask_about_meeting(request: Request, session_id: str, req: AskRequest):
    """
    Answers a natural language query about the meeting strictly grounded in its transcript and summary.
    Q&A is persisted to the meeting's chat history.
    """
    check_rate_limit(request, bucket="ask")

    def _evidence_for(question: str, segments) -> list[str]:
        tokens = set(w for w in _re.findall(r"\w+", question.lower()) if len(w) > 3)
        if not tokens or not segments:
            return []
        scored: list[tuple[int, str]] = []
        for s in segments:
            text = (s.text or "").lower()
            hits = sum(1 for t in tokens if t in text)
            if hits:
                scored.append((hits, s.id))
        scored.sort(reverse=True)
        return [seg_id for _, seg_id in scored[:3]]

    session = session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    transcript_lines = []
    segments = session.final_transcript.segments if (session.final_transcript and session.final_transcript.segments) else []
    if segments:
        for s in segments:
            transcript_lines.append(f"[{s.id}] {s.speaker}: {s.text}")
    elif session.live_transcript:
        for item in session.live_transcript:
            transcript_lines.append(f"{item.speaker_label or 'Speaker'}: {item.text}")

    context = "\n".join(transcript_lines)
    summary_text = ""
    if session.summary:
        summary_text = f"Summary: {session.summary.executive_summary}\n"
        if session.summary.decisions:
            summary_text += "Decisions: " + "; ".join(d.decision for d in session.summary.decisions) + "\n"
        if session.summary.action_items:
            summary_text += "Actions: " + "; ".join(f"{a.task} ({a.assignee})" for a in session.summary.action_items) + "\n"

    if not settings.gemini_api_key:
        meeting_title = session.title or session_id
        answer = (
            f"Based on the transcript for \"{meeting_title}\", no additional information was recorded on this question."
        )
        evidence = _evidence_for(req.question, segments)
        session_manager.add_qa(session_id, req.question, answer, evidence)
        return AskResponse(answer=answer, evidence_segment_ids=evidence)

    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        prompt = (
            f"You are a factual meeting assistant. Answer this question based STRICTLY on the meeting summary and transcript below.\n"
            f"{summary_text}\nTranscript:\n{context}\n\n"
            f"Question: {req.question}\n"
            f"Answer concisely in 1-2 clear sentences. If you cannot find the answer, state that it was not discussed during the meeting."
        )
        resp = await client.aio.models.generate_content(
            model=settings.gemini_summary_model,
            contents=prompt
        )
        ans = resp.text.strip() if resp and resp.text else "No answer generated."
        evidence = _evidence_for(req.question, segments)
        session_manager.add_qa(session_id, req.question, ans, evidence)
        return AskResponse(answer=ans, evidence_segment_ids=evidence)
    except Exception as e:
        answer = f"Could not answer question: {str(e)}"
        session_manager.add_qa(session_id, req.question, answer, [])
        return AskResponse(answer=answer, evidence_segment_ids=[])


@router.get("/{session_id}/export")
async def export_session(session_id: str, format: str = Query("markdown", pattern="^(markdown|txt|json)$")):
    """Exports session transcript and summary in Markdown, TXT, or JSON."""
    session = session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if format == "json":
        return Response(
            content=session.model_dump_json(indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="transcript_{session_id}.json"'}
        )

    lines = []
    lines.append(f"# Meeting Transcript & Summary ({session_id})")
    lines.append(f"Date: {session.started_at or 'N/A'}")
    lines.append(f"Language Mode: {session.language_mode} | Detected: {session.detected_language or 'N/A'}\n")

    if session.summary:
        lines.append("## Executive Summary")
        lines.append(session.summary.executive_summary + "\n")

        if session.summary.key_points:
            lines.append("## Key Points")
            for kp in session.summary.key_points:
                lines.append(f"- {kp}")
            lines.append("")

        if session.summary.decisions:
            lines.append("## Decisions")
            for dec in session.summary.decisions:
                evidence = f" (Evidence: {', '.join(dec.evidence_segment_ids)})" if dec.evidence_segment_ids else ""
                lines.append(f"- {dec.decision}{evidence}")
            lines.append("")

        if session.summary.action_items:
            lines.append("## Action Items")
            for act in session.summary.action_items:
                assignee = f" [{act.assignee}]" if act.assignee else ""
                deadline = f" (Due: {act.deadline})" if act.deadline else ""
                status = "[x]" if act.completed else "[ ]"
                lines.append(f"- {status} {act.task}{assignee}{deadline}")
            lines.append("")

    lines.append("## Full Transcript")
    if session.final_transcript and session.final_transcript.segments:
        for seg in session.final_transcript.segments:
            lines.append(f"**[{seg.start:.1f}s - {seg.end:.1f}s] {seg.speaker}:** {seg.text}\n")
    elif session.live_transcript:
        for item in session.live_transcript:
            lines.append(f"{item.text}")

    content = "\n".join(lines)
    media_type = "text/markdown" if format == "markdown" else "text/plain"
    ext = "md" if format == "markdown" else "txt"

    return PlainTextResponse(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="transcript_{session_id}.{ext}"'}
    )


@router.get("/{session_id}/ics")
async def export_session_ics(session_id: str):
    """Exports the meeting as a VCALENDAR (.ics) event for calendar apps."""
    session = session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    def _fmt(dt: datetime) -> str:
        return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    end = datetime.now(timezone.utc)
    start = end
    if session.started_at:
        try:
            start = datetime.fromisoformat(session.started_at.replace("Z", "+00:00"))
        except ValueError:
            try:
                start = datetime.strptime(session.started_at, "%Y-%m-%dT%H:%M:%SZ").replace(
                    tzinfo=timezone.utc
                )
            except ValueError:
                start = end
    duration = max(60.0, float(session.duration_seconds or 0))
    from datetime import timedelta as _td
    end = start + _td(seconds=duration)

    def _esc(text: str) -> str:
        return (
            (text or "")
            .replace("\\", "\\\\")
            .replace(";", "\\;")
            .replace(",", "\\,")
            .replace("\n", "\\n")
        )

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Scribe//Meeting//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:{session_id}@scribe",
        f"DTSTAMP:{_fmt(datetime.now(timezone.utc))}",
        f"DTSTART:{_fmt(start)}",
        f"DTEND:{_fmt(end)}",
        f"SUMMARY:{_esc(session.title or 'Meeting')}",
        f"DESCRIPTION:{_esc((session.summary.executive_summary if session.summary else '') or 'Recorded with Scribe')}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return PlainTextResponse(
        content="\r\n".join(lines),
        media_type="text/calendar",
        headers={"Content-Disposition": f'attachment; filename="meeting_{session_id}.ics"'},
    )
