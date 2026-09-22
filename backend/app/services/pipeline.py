"""Shared post-recording processing pipeline (used by WebSocket stop and REST upload).

The recording is uploaded to the Gemini Files API exactly once; the resulting
part is reused for both final transcription and summarization.
"""
import asyncio
import logging
import os
from typing import Awaitable, Callable, Optional

from google import genai
from google.genai import types

from app.config import settings
from app.models.transcription import FinalTranscriptData
from app.services.gemini_transcribe import gemini_final_transcriber
from app.services.session_manager import session_manager
from app.services.summarizer import meeting_summarizer

logger = logging.getLogger(__name__)

EventSink = Callable[[dict], Awaitable[None]]

# Hard ceiling on post-recording processing so a hung LLM call cannot pin
# resources forever.
PROCESSING_TIMEOUT_SECONDS = 300


async def _noop_event(data: dict) -> None:
    return None


async def upload_audio_part(wav_path: Optional[str], wav_bytes: Optional[bytes]) -> Optional[types.Part]:
    """Uploads the recording once via the Files API. Returns None on failure so
    callers can fall back to inline bytes (never raises)."""
    if not settings.gemini_api_key:
        return None
    client = genai.Client(api_key=settings.gemini_api_key)
    try:
        if wav_path and os.path.exists(wav_path):
            uploaded = await client.aio.files.upload(file=wav_path)
        elif wav_bytes:
            uploaded = await client.aio.files.upload(
                file=io_BytesIO_named(wav_bytes, name=os.path.basename(wav_path or "recording.wav"))
            )
        else:
            return None
        if uploaded and getattr(uploaded, "uri", None):
            logger.info("Audio uploaded once to Gemini Files API: %s", uploaded.uri)
            # Use the MIME type the Files API actually stored — a hardcoded
            # "audio/wav" mismatches the detected "audio/x-wav" and the API
            # rejects the request with HTTP 400.
            mime_type = getattr(uploaded, "mime_type", None) or "audio/wav"
            return types.Part.from_uri(file_uri=uploaded.uri, mime_type=mime_type)
    except Exception as e:
        logger.warning("Files API upload failed; falling back to inline audio bytes: %s", e)
    return None


def io_BytesIO_named(data: bytes, name: str):
    import io
    buf = io.BytesIO(data)
    buf.name = name  # type: ignore[attr-defined]
    return buf


async def process_recording(
    session_id: str,
    *,
    wav_path: Optional[str] = None,
    wav_bytes: Optional[bytes] = None,
    event: Optional[EventSink] = None,
    on_complete_cleanup: Optional[Callable[[], Awaitable[None]]] = None,
) -> None:
    """
    Runs: persist audio -> final diarized transcript -> grounded summary -> complete event.
    Raises nothing: errors are recorded on the session and emitted as `error` events.
    """
    emit = event or _noop_event
    session_manager.set_processing(session_id)
    session = session_manager.get(session_id)
    language_mode = session.language_mode if session else "auto"

    # Ensure audio exists on disk for playback (WS path may only have a path already)
    if wav_path is None and wav_bytes is not None:
        os.makedirs(settings.audio_dir, exist_ok=True)
        wav_path = os.path.join(settings.audio_dir, f"{session_id}.wav")
        try:
            with open(wav_path, "wb") as f:
                f.write(wav_bytes)
        except OSError as e:
            logger.warning("[%s] Failed persisting audio for replay: %s", session_id, e)
            wav_path = None

    # Single upload reused by both Gemini calls below
    audio_part = await upload_audio_part(wav_path, wav_bytes)

    await emit({"type": "processing", "stage": "final_transcription"})
    live_transcript_text = session_manager.get_live_transcript_text(session_id)
    logger.info(
        "[%s] Forwarding live transcript (%d chars) to post-recording diarization.",
        session_id, len(live_transcript_text),
    )
    await emit({"type": "processing", "stage": "speaker_diarization"})

    final_data = FinalTranscriptData(language=language_mode, segments=[])
    try:
        final_data = await gemini_final_transcriber.transcribe_audio(
            wav_bytes=wav_bytes if audio_part is None else None,
            language_mode=language_mode,
            live_transcript_text=live_transcript_text,
            audio_part=audio_part,
            wav_path=wav_path if audio_part is None else None,
        )
        session_manager.set_final_transcript(session_id, final_data)
        await emit({
            "type": "final_transcript",
            "session_id": session_id,
            "data": final_data.model_dump(),
        })
    except Exception as e:
        logger.error("[%s] Final transcription error: %s", session_id, e)
        if live_transcript_text.strip():
            # Never block summarization on a transient model failure: segment
            # the verified live transcript (real user speech, no fabrication)
            # so the meeting still gets a grounded summary.
            logger.warning(
                "[%s] Falling back to segmented live transcript for summarization.",
                session_id,
            )
            final_data = gemini_final_transcriber.segment_live_transcript(
                language_mode, live_transcript_text
            )
            session_manager.set_final_transcript(session_id, final_data)
            await emit({
                "type": "final_transcript",
                "session_id": session_id,
                "data": final_data.model_dump(),
            })
        else:
            session_manager.set_error(session_id, f"Final transcription failed: {e}")
            await emit({
                "type": "error",
                "code": "FINAL_TRANSCRIBE_ERROR",
                "message": f"Final transcription failed: {str(e)}",
                "session_id": session_id,
            })
            if on_complete_cleanup:
                await on_complete_cleanup()
            return

    await emit({"type": "processing", "stage": "summarization"})
    agenda = session.agenda if session else None
    try:
        summary = await meeting_summarizer.summarize_transcript(
            final_data,
            audio_wav_bytes=wav_bytes if audio_part is None else None,
            live_transcript_text=live_transcript_text,
            audio_part=audio_part,
            agenda=agenda,
        )
    except Exception as e:
        if not final_data.segments:
            logger.error("[%s] Summarization error: %s", session_id, e)
            session_manager.set_error(session_id, f"Summarization failed: {e}")
            await emit({
                "type": "error",
                "code": "SUMMARIZATION_ERROR",
                "message": f"Summarization failed: {str(e)}",
                "session_id": session_id,
            })
            if on_complete_cleanup:
                await on_complete_cleanup()
            return
        # All model calls failed but we still hold real transcript text —
        # degrade to a transcript-grounded summary rather than erroring out.
        logger.warning(
            "[%s] Summarization models failed (%s); using transcript-grounded fallback.",
            session_id, e,
        )
        summary = meeting_summarizer.grounded_fallback_summary(final_data)

    session_manager.set_summary(session_id, summary)
    await emit({
        "type": "summary",
        "session_id": session_id,
        "data": summary.model_dump(),
    })

    await emit({"type": "complete", "session_id": session_id})
    if on_complete_cleanup:
        await on_complete_cleanup()


async def process_recording_bounded(
    session_id: str,
    *,
    wav_path: Optional[str] = None,
    wav_bytes: Optional[bytes] = None,
    event: Optional[EventSink] = None,
    on_complete_cleanup: Optional[Callable[[], Awaitable[None]]] = None,
) -> None:
    """process_recording with a hard timeout so a hung model call cannot pin the session."""
    emit = event or _noop_event
    try:
        await asyncio.wait_for(
            process_recording(
                session_id,
                wav_path=wav_path,
                wav_bytes=wav_bytes,
                event=emit,
                on_complete_cleanup=on_complete_cleanup,
            ),
            timeout=PROCESSING_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error("[%s] Post-processing timed out after %ss.", session_id, PROCESSING_TIMEOUT_SECONDS)
        session_manager.set_error(session_id, "Processing timed out")
        await emit({
            "type": "error",
            "code": "PROCESSING_TIMEOUT",
            "message": "Post-recording processing timed out. The session was saved; please retry from the session view.",
            "session_id": session_id,
        })
    except Exception as e:
        logger.exception("[%s] Post-processing failed: %s", session_id, e)
        session_manager.set_error(session_id, str(e))
        await emit({
            "type": "error",
            "code": "PROCESSING_FAILED",
            "message": f"Post-recording processing failed: {str(e)}",
            "session_id": session_id,
        })
