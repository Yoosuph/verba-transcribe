import json
import logging
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.session_manager import session_manager
from app.services.audio_recorder import AudioAccumulator
from app.services.gemini_live import GeminiLiveTranscriber
from app.services.gemini_transcribe import gemini_final_transcriber
from app.services.summarizer import meeting_summarizer
from app.models.transcription import FinalTranscriptData
from app.config import is_valid_session_id, settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Application-level liveness interval: a failed ping send detects dead peers
# even when no audio is flowing (browsers keep idle TCP sockets silent).
HEARTBEAT_INTERVAL_SECONDS = 20
# Hard ceiling on post-recording processing so a hung LLM call cannot pin
# the socket and session resources forever.
PROCESSING_TIMEOUT_SECONDS = 300


@router.websocket("/ws/transcribe/{session_id}")
async def websocket_transcription_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time bidirectional audio transcription and post-session processing.

    Enforces server-side limits on the live path:
      - `max_session_minutes` caps recorded audio duration (previously REST-only)
      - `max_audio_size_mb` caps the PCM accumulator (AudioAccumulator)
    """
    if not is_valid_session_id(session_id):
        await websocket.close(code=1008, reason="Invalid session id")
        return

    await websocket.accept()
    logger.info(f"WebSocket client connected for session: {session_id}")

    # Ensure session exists
    session = session_manager.get_or_create(session_id)
    audio_accumulator = AudioAccumulator(session_id)
    live_transcriber: GeminiLiveTranscriber = None

    # Strong references to fire-and-forget tasks (prevents GC of pending tasks)
    background_tasks: set = set()
    stopping = False
    limit_hit = False

    def spawn(coro) -> asyncio.Task:
        task = asyncio.create_task(coro)
        background_tasks.add(task)
        task.add_done_callback(background_tasks.discard)
        return task

    # Safe send helper
    async def safe_send(data: dict):
        try:
            await websocket.send_json(data)
        except Exception as e:
            logger.debug(f"Failed sending WS message to {session_id}: {e}")

    # Callbacks for Gemini Live
    def on_interim(text: str):
        session_manager.add_live_interim(session_id, text)
        spawn(safe_send({
            "type": "transcript.interim",
            "text": text,
            "session_id": session_id
        }))

    def on_final(text: str):
        session_manager.add_live_final(session_id, text)
        spawn(safe_send({
            "type": "transcript.final",
            "text": text,
            "session_id": session_id
        }))

    def on_error(err_msg: str):
        spawn(safe_send({
            "type": "error",
            "code": "GEMINI_LIVE_ERROR",
            "message": err_msg
        }))

    # Acknowledge connection
    await safe_send({
        "type": "connected",
        "session_id": session_id
    })

    async def stop_live_transcriber() -> None:
        nonlocal live_transcriber
        if live_transcriber:
            try:
                await live_transcriber.stop()
            except Exception as e:
                logger.warning(f"[{session_id}] Error stopping live transcriber: {e}")
            live_transcriber = None

    async def run_post_processing() -> None:
        """Final diarization, then capable-model summary/report from the full recording."""
        nonlocal limit_hit
        session_manager.set_processing(session_id)

        # Save audio permanently for playback and replay
        if audio_accumulator.total_bytes > 0:
            try:
                await audio_accumulator.save_recording()
                logger.info(f"[{session_id}] Audio successfully saved for replay.")
            except Exception as e:
                logger.error(f"[{session_id}] Failed to save audio for replay: {e}")

        await safe_send({"type": "processing", "stage": "final_transcription"})

        wav_bytes = audio_accumulator.get_wav_bytes()
        live_transcript_text = session_manager.get_live_transcript_text(session_id)
        logger.info(f"[{session_id}] Forwarding live transcript ({len(live_transcript_text)} chars) to post-recording diarization.")

        await safe_send({"type": "processing", "stage": "speaker_diarization"})

        final_data = FinalTranscriptData(language=session.language_mode, segments=[])
        try:
            final_data = await gemini_final_transcriber.transcribe_audio(
                wav_bytes=wav_bytes,
                language_mode=session.language_mode,
                live_transcript_text=live_transcript_text
            )
            session_manager.set_final_transcript(session_id, final_data)

            await safe_send({
                "type": "final_transcript",
                "session_id": session_id,
                "data": final_data.model_dump()
            })
        except Exception as e:
            logger.error(f"Final transcription error: {e}")
            await safe_send({
                "type": "error",
                "code": "FINAL_TRANSCRIBE_ERROR",
                "message": f"Final transcription failed: {str(e)}"
            })

        # Summarization: the FULL recording is handed to the more capable model
        # (gemini_summary_model) alongside the transcript for grounding.
        await safe_send({"type": "processing", "stage": "summarization"})

        try:
            summary = await meeting_summarizer.summarize_transcript(
                final_data,
                audio_wav_bytes=wav_bytes,
                live_transcript_text=live_transcript_text
            )
            session_manager.set_summary(session_id, summary)

            await safe_send({
                "type": "summary",
                "session_id": session_id,
                "data": summary.model_dump()
            })
        except Exception as e:
            logger.error(f"Summarization error: {e}")
            await safe_send({
                "type": "error",
                "code": "SUMMARIZATION_ERROR",
                "message": f"Summarization failed: {str(e)}"
            })

        # Only the fast post-recording pipeline (transcript + summary) runs here.
        if limit_hit:
            await safe_send({
                "type": "session_limit",
                "session_id": session_id,
                "code": "SESSION_FORCED_STOP",
                "message": "Processing completed after a server-side limit stop."
            })

        await safe_send({
            "type": "complete",
            "session_id": session_id
        })

        # Free the in-memory PCM buffer (saved WAV remains on disk for replay)
        await audio_accumulator.cleanup()

    async def stop_and_process(reason: str = "client") -> None:
        """Stops the live path and runs post-processing exactly once, bounded by a timeout."""
        nonlocal stopping
        if stopping:
            return
        stopping = True
        logger.info(f"[{session_id}] Stop signal ({reason}); beginning post-processing.")
        await stop_live_transcriber()
        try:
            await asyncio.wait_for(
                run_post_processing(),
                timeout=PROCESSING_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            logger.error(f"[{session_id}] Post-processing timed out after {PROCESSING_TIMEOUT_SECONDS}s.")
            session_manager.set_error(session_id, "Processing timed out")
            await safe_send({
                "type": "error",
                "code": "PROCESSING_TIMEOUT",
                "message": "Post-recording processing timed out. The session was saved; please retry from the session view."
            })
        except Exception as e:
            logger.exception(f"[{session_id}] Post-processing failed: {e}")
            session_manager.set_error(session_id, str(e))
            await safe_send({
                "type": "error",
                "code": "PROCESSING_FAILED",
                "message": f"Post-recording processing failed: {str(e)}"
            })

    async def enforce_limits_async(code: str, message: str) -> None:
        """Forces a stop when a server-side limit is breached (duration/size)."""
        nonlocal limit_hit
        if limit_hit:
            return
        limit_hit = True
        logger.warning(f"[{session_id}] Enforcing limit {code}: {message}")
        await safe_send({
            "type": "session_limit",
            "session_id": session_id,
            "code": code,
            "message": message
        })
        await stop_and_process(reason=code)

    async def heartbeat_monitor() -> None:
        """Periodically pings the client; a failed send detects dead peers even
        when no audio frames are flowing."""
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)
                await websocket.send_json({"type": "ping"})
        except Exception:
            return

    heartbeat_task = asyncio.create_task(heartbeat_monitor())

    try:
        while True:
            message = await websocket.receive()

            # 1. TEXT MESSAGES (Control signals)
            if "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type")

                    if msg_type == "ping" or msg_type == "pong":
                        # Application-level keepalive reply; nothing to do.
                        continue

                    if msg_type == "start":
                        lang_mode = payload.get("language_mode", "auto")
                        session_manager.start_recording(session_id, language_mode=lang_mode)

                        # Stop any previous live session to avoid leaked Gemini connections
                        await stop_live_transcriber()

                        # Initialize Gemini Live Transcriber
                        live_transcriber = GeminiLiveTranscriber(
                            session_id=session_id,
                            language_mode=lang_mode,
                            on_interim=on_interim,
                            on_final=on_final,
                            on_error=on_error
                        )
                        started = await live_transcriber.start()
                        if not started:
                            await safe_send({
                                "type": "error",
                                "code": "START_FAILED",
                                "message": "Failed to initialize Gemini Live transcription."
                            })

                    elif msg_type == "stop":
                        # Runs the full bounded post-processing pipeline inline.
                        await stop_and_process(reason="client")

                    elif msg_type == "rename_speaker":
                        old_name = payload.get("old_name")
                        new_name = payload.get("new_name")
                        if old_name and new_name:
                            updated_session = session_manager.rename_speaker(session_id, old_name, new_name)
                            if updated_session:
                                if updated_session.final_transcript:
                                    await safe_send({
                                        "type": "final_transcript",
                                        "session_id": session_id,
                                        "data": updated_session.final_transcript.model_dump()
                                    })
                                if updated_session.summary:
                                    await safe_send({
                                        "type": "summary",
                                        "session_id": session_id,
                                        "data": updated_session.summary.model_dump()
                                    })

                except json.JSONDecodeError:
                    logger.warning("Received invalid JSON on WebSocket")

            # 2. BINARY FRAMES (16kHz 16-bit mono PCM chunks)
            elif "bytes" in message and message["bytes"]:
                pcm_chunk = message["bytes"]

                if not stopping:
                    audio_accumulator.append_pcm(pcm_chunk)

                    # Server-side duration limit (previously dead config on WS path)
                    if audio_accumulator.duration_seconds >= audio_accumulator.duration_limit_seconds:
                        spawn(enforce_limits_async(
                            "SESSION_DURATION_LIMIT",
                            f"Maximum session duration of {settings.max_session_minutes} minutes reached; finalizing session."
                        ))
                    elif audio_accumulator.overflowed:
                        spawn(enforce_limits_async(
                            "SESSION_SIZE_LIMIT",
                            f"Maximum audio size of {settings.max_audio_size_mb}MB reached; finalizing session."
                        ))
                    elif live_transcriber:
                        await live_transcriber.send_audio_chunk(pcm_chunk)

    except (WebSocketDisconnect, RuntimeError):
        logger.info(f"WebSocket disconnected for session: {session_id}")
    except Exception as e:
        logger.error(f"Unexpected WebSocket error: {e}")
    finally:
        heartbeat_task.cancel()
        if not stopping and audio_accumulator.total_bytes > 0:
            # Client vanished mid-recording: persist whatever was captured for replay.
            try:
                await audio_accumulator.save_recording()
            except Exception as e:
                logger.warning(f"[{session_id}] Could not persist audio after disconnect: {e}")
        await stop_live_transcriber()
        await audio_accumulator.cleanup()
        # Await pending outbound tasks so they are not dropped mid-send
        if background_tasks:
            await asyncio.gather(*background_tasks, return_exceptions=True)
