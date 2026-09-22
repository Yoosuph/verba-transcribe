import json
import logging
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import is_valid_session_id, settings
from app.core.auth import require_ws_auth
from app.core.ratelimit import check_ws_rate_limit
from app.services.session_manager import session_manager
from app.services.session_runtime import SessionRuntime, runtime_registry
from app.services.pipeline import process_recording_bounded

logger = logging.getLogger(__name__)
router = APIRouter()

# Application-level liveness interval: a failed ping send detects dead peers
# even when no audio is flowing (browsers keep idle TCP sockets silent).
HEARTBEAT_INTERVAL_SECONDS = 20


async def stop_and_process_runtime(runtime: SessionRuntime, reason: str = "client") -> None:
    """Stops the live path and runs post-processing exactly once on the shared runtime."""
    if runtime.stopping:
        return
    runtime.stopping = True
    logger.info("[%s] Stop signal (%s); beginning post-processing.", runtime.session_id, reason)

    await runtime.stop_live()

    async def _emit(data: dict) -> None:
        runtime.broadcast(data)

    async def _cleanup() -> None:
        # Free the working PCM buffer (saved WAV remains on disk for replay)
        await runtime.accumulator.cleanup()
        runtime_registry.remove(runtime.session_id)

    try:
        # Finalize audio to disk first (broadcast progress while doing so)
        wav_path = None
        if runtime.accumulator.total_bytes > 0:
            try:
                wav_path = await runtime.accumulator.save_recording()
                logger.info("[%s] Audio successfully saved for replay.", runtime.session_id)
            except Exception as e:
                logger.error("[%s] Failed to save audio for replay: %s", runtime.session_id, e)

        if runtime.limit_hit:
            await _emit({
                "type": "session_limit",
                "session_id": runtime.session_id,
                "code": "SESSION_FORCED_STOP",
                "message": "Processing started after a server-side limit stop.",
            })

        await process_recording_bounded(
            runtime.session_id,
            wav_path=wav_path,
            event=_emit,
            on_complete_cleanup=_cleanup,
        )
    except Exception as e:
        logger.exception("[%s] Post-processing crashed: %s", runtime.session_id, e)
        session_manager.set_error(runtime.session_id, str(e))
        await _emit({
            "type": "error",
            "code": "PROCESSING_FAILED",
            "message": f"Post-recording processing failed: {str(e)}",
            "session_id": runtime.session_id,
        })
        await _cleanup()


def _snapshot_events(session) -> list:
    """Events sent on (re)connect so a client that missed broadcasts can resync."""
    events = []
    if session.final_transcript:
        events.append({
            "type": "final_transcript",
            "session_id": session.id,
            "data": session.final_transcript.model_dump(),
        })
    if session.summary:
        events.append({
            "type": "summary",
            "session_id": session.id,
            "data": session.summary.model_dump(),
        })
    if session.status == "complete":
        events.append({"type": "complete", "session_id": session.id})
    elif session.status == "processing":
        stage = "summarization" if session.final_transcript else "final_transcription"
        events.append({"type": "processing", "stage": stage})
    if session.error_message:
        events.append({
            "type": "error",
            "code": "SESSION_ERROR",
            "message": session.error_message,
            "session_id": session.id,
        })
    return events


@router.websocket("/ws/transcribe/{session_id}")
async def websocket_transcription_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time bidirectional audio transcription and post-session processing.

    - Session IDs are server-generated via POST /api/sessions (unknown IDs are rejected).
    - The socket is an attach/detach view onto a per-session runtime: reconnects
      resume the same accumulator + live transcriber without losing audio.
    - Enforces server-side limits on the live path (duration / size).
    """
    if not is_valid_session_id(session_id):
        await websocket.close(code=1008, reason="Invalid session id")
        return

    await require_ws_auth(websocket)
    if websocket.client_state.name == "CLOSED":  # auth rejected the handshake
        return

    # Session must pre-exist (created server-side) — clients cannot invent IDs.
    if not session_manager.exists(session_id):
        await websocket.close(code=1008, reason="Unknown session id")
        return

    await websocket.accept()

    runtime = runtime_registry.get_or_create(session_id)
    runtime.attach(websocket)
    resumed = runtime.started and session_manager.get(session_id) is not None and \
        session_manager.get(session_id).status == "recording"

    logger.info("WebSocket client attached for session: %s (resumed=%s)", session_id, resumed)

    await websocket.send_json({
        "type": "connected",
        "session_id": session_id,
        "resumed": resumed,
    })

    # Replay missed terminal/state events so a reconnecting client resyncs
    session = session_manager.get(session_id)
    if session:
        for evt in _snapshot_events(session):
            await websocket.send_json(evt)

    heartbeat_task = asyncio.create_task(_heartbeat(websocket))

    def enforce_limit(code: str, message: str):
        if runtime.limit_hit or runtime.stopping:
            return
        runtime.limit_hit = True
        logger.warning("[%s] Enforcing limit %s: %s", session_id, code, message)
        runtime.broadcast({
            "type": "session_limit",
            "session_id": session_id,
            "code": code,
            "message": message,
        })
        runtime.processing_task = runtime.spawn(stop_and_process_runtime(runtime, reason=code))

    try:
        while True:
            message = await websocket.receive()

            # 1. TEXT MESSAGES (Control signals)
            if "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type")

                    if msg_type in ("ping", "pong"):
                        if msg_type == "ping":
                            await websocket.send_json({"type": "pong"})
                        continue

                    if msg_type == "start":
                        lang_mode = payload.get("language_mode", "auto")
                        if runtime.stopping:
                            # Session already finalized; ignore stale start
                            continue
                        if runtime.started and runtime.live_transcriber:
                            # Already recording on another/reconnected socket
                            session_manager.start_recording(session_id, language_mode=lang_mode)
                            continue
                        started = await runtime.start_live(lang_mode)
                        if not started:
                            await websocket.send_json({
                                "type": "error",
                                "code": "START_FAILED",
                                "message": "Failed to initialize Gemini Live transcription.",
                            })

                    elif msg_type == "stop":
                        if not check_ws_rate_limit(websocket.client.host if websocket.client else None):
                            await websocket.send_json({
                                "type": "error",
                                "code": "RATE_LIMITED",
                                "message": "Rate limit exceeded; please retry shortly.",
                            })
                            continue
                        if runtime.stopping:
                            continue
                        # Run the bounded post-processing pipeline as a background task
                        # so heartbeats and further control messages keep flowing.
                        runtime.processing_task = runtime.spawn(
                            stop_and_process_runtime(runtime, reason="client")
                        )

                except json.JSONDecodeError:
                    logger.warning("Received invalid JSON on WebSocket")

            # 2. BINARY FRAMES (16kHz 16-bit mono PCM chunks)
            elif "bytes" in message and message["bytes"]:
                pcm_chunk = message["bytes"]

                if not runtime.stopping:
                    runtime.send_audio(pcm_chunk)

                    if runtime.accumulator.duration_seconds >= runtime.accumulator.duration_limit_seconds:
                        enforce_limit(
                            "SESSION_DURATION_LIMIT",
                            f"Maximum session duration of {settings.max_session_minutes} minutes reached; finalizing session.",
                        )
                    elif runtime.accumulator.overflowed:
                        enforce_limit(
                            "SESSION_SIZE_LIMIT",
                            f"Maximum audio size of {settings.max_audio_size_mb}MB reached; finalizing session.",
                        )

    except (WebSocketDisconnect, RuntimeError):
        logger.info("WebSocket detached for session: %s", session_id)
    except Exception as e:
        logger.error("Unexpected WebSocket error for %s: %s", session_id, e)
    finally:
        heartbeat_task.cancel()
        runtime.detach(websocket)
        # If the client never started recording and left, drop the idle runtime.
        if not runtime.started and not runtime.subscribers and not runtime.stopping:
            await runtime.dispose()
            runtime_registry.remove(session_id)


async def _heartbeat(websocket: WebSocket) -> None:
    """Periodically pings the client; a failed send detects dead peers."""
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)
            await websocket.send_json({"type": "ping"})
    except Exception:
        return
