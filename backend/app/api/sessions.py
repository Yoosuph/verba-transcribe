import os
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Query
from fastapi.responses import Response, PlainTextResponse, FileResponse
from typing import List
from app.models.transcription import (
    SessionState,
    RenameSpeakerRequest,
    UpdateActionItemRequest,
    FinalTranscriptData,
    MeetingSummary,
    AskRequest,
    AskResponse,
    UpdateMeetingInfoRequest,
    MeetingInfo,
    TranscriptSegment
)
from app.services.session_manager import session_manager
from app.services.gemini_transcribe import gemini_final_transcriber
from app.services.summarizer import meeting_summarizer
from app.config import settings, is_valid_session_id
from google import genai
from google.genai import types
import logging

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
    dependencies=[Depends(validate_session_id_path)],
)

@router.get("", response_model=List[SessionState])
async def list_sessions():
    """Lists all active and completed sessions."""
    return session_manager.list_all()

@router.post("", response_model=SessionState)
async def create_session(language_mode: str = Query("auto")):
    """Creates a new transcription session."""
    session = session_manager.get_or_create(language_mode=language_mode)
    return session


@router.get("/{session_id}", response_model=SessionState)
async def get_session(session_id: str):
    """Retrieves current session state, transcript, and summary."""
    if not is_valid_session_id(session_id):
        raise HTTPException(status_code=400, detail="Invalid session id")
    session = session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.post("/{session_id}/speakers/rename", response_model=SessionState)
async def rename_speaker(session_id: str, request: RenameSpeakerRequest):
    """Renames a generic speaker label (e.g. 'Speaker 1' -> 'Yusuf') across transcripts and summaries."""
    updated = session_manager.rename_speaker(session_id, request.old_name, request.new_name)
    if not updated:
        raise HTTPException(status_code=404, detail="Session not found")
    return updated

@router.patch("/{session_id}/actions/{action_id}")
async def toggle_action_item(session_id: str, action_id: str, request: UpdateActionItemRequest):
    """Toggles completion status for an action item."""
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
    if not is_valid_session_id(session_id):
        raise HTTPException(status_code=400, detail="Invalid session id")
    audio_path = os.path.join(settings.temp_audio_dir, f"{session_id}.wav")
    try:
        if not os.path.exists(audio_path) or os.path.getsize(audio_path) < 44:
            raise HTTPException(status_code=404, detail="Audio recording not available for this session")
    except HTTPException:
        raise
    except OSError:
        raise HTTPException(status_code=404, detail="Audio recording not available for this session")

    try:
        return FileResponse(
            path=audio_path,
            media_type="audio/wav",
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=86400",
                "Content-Disposition": f'inline; filename="meeting_{session_id}.wav"'
            }
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Audio recording not available for this session")

@router.post("/{session_id}/complete-audio", response_model=SessionState)
async def process_complete_audio(
    session_id: str,
    audio_file: UploadFile = File(...)
):
    """
    Direct audio upload endpoint for post-recording processing.
    Transcribes with speaker diarization and generates grounded summary.
    """
    if not is_valid_session_id(session_id):
        raise HTTPException(status_code=400, detail="Invalid session id")
    session = session_manager.get_or_create(session_id)
    session_manager.set_processing(session_id)

    audio_bytes = await audio_file.read()
    max_bytes = settings.max_audio_size_mb * 1024 * 1024
    if len(audio_bytes) > max_bytes:
        session_manager.set_error(session_id, f"Audio exceeds {settings.max_audio_size_mb}MB limit")
        raise HTTPException(status_code=413, detail=f"Audio exceeds {settings.max_audio_size_mb}MB limit")

    # Save audio for playback
    os.makedirs(settings.temp_audio_dir, exist_ok=True)
    audio_path = os.path.join(settings.temp_audio_dir, f"{session_id}.wav")
    try:
        async with aiofiles.open(audio_path, "wb") as f:
            await f.write(audio_bytes)
    except Exception as e:
        logger.warning(f"[{session_id}] Failed to persist audio for replay: {e}")

    try:
        live_transcript_text = session_manager.get_live_transcript_text(session_id)
        final_transcript = await gemini_final_transcriber.transcribe_audio(
            wav_bytes=audio_bytes,
            language_mode=session.language_mode,
            live_transcript_text=live_transcript_text
        )
        session_manager.set_final_transcript(session_id, final_transcript)

        summary = await meeting_summarizer.summarize_transcript(
            final_transcript,
            audio_wav_bytes=audio_bytes,
            live_transcript_text=live_transcript_text
        )
        session_manager.set_summary(session_id, summary)

        return session_manager.get(session_id)
    except Exception as e:
        session_manager.set_error(session_id, str(e))
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@router.post("/{session_id}/translate")
async def translate_transcript_to_english(session_id: str):
    """
    Optional translation feature: Translates non-English segments in the finalized transcript to English
    while preserving original speaker labels and timing.
    """
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

@router.post("/{session_id}/ask", response_model=AskResponse)
async def ask_about_meeting(session_id: str, request: AskRequest):
    """
    Answers a natural language query about the meeting strictly grounded in its transcript and summary.
    """
    import re as _re

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

    # Gather context from real transcript

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
        return AskResponse(
            answer=f"Based on the transcript for \"{meeting_title}\", no additional information was recorded on this question.",
            evidence_segment_ids=_evidence_for(request.question, segments)
        )

    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        prompt = (
            f"You are a factual meeting assistant. Answer this question based STRICTLY on the meeting summary and transcript below.\n"
            f"{summary_text}\nTranscript:\n{context}\n\n"
            f"Question: {request.question}\n"
            f"Answer concisely in 1-2 clear sentences. If you cannot find the answer, state that it was not discussed during the meeting."
        )
        resp = await client.aio.models.generate_content(
            model=settings.gemini_summary_model,
            contents=prompt
        )
        ans = resp.text.strip() if resp and resp.text else "No answer generated."
        return AskResponse(answer=ans, evidence_segment_ids=_evidence_for(request.question, segments))
    except Exception as e:
        return AskResponse(answer=f"Could not answer question: {str(e)}", evidence_segment_ids=[])

@router.put("/{session_id}/meeting-info", response_model=SessionState)
async def update_meeting_info(session_id: str, request: UpdateMeetingInfoRequest):
    """Updates user-provided meeting context (title, date, type, location, organizer, participants)."""
    session = session_manager.update_meeting_info(session_id, request.meeting_info)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

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
