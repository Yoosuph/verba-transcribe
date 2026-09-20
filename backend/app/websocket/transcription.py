import json
import logging
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.session_manager import session_manager
from app.services.audio_recorder import AudioAccumulator
from app.services.gemini_live import GeminiLiveTranscriber
from app.services.gemini_transcribe import gemini_final_transcriber
from app.services.summarizer import meeting_summarizer

logger = logging.getLogger(__name__)
router = APIRouter()

@router.websocket("/ws/transcribe/{session_id}")
async def websocket_transcription_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time bidirectional audio transcription and post-session processing.
    """
    await websocket.accept()
    logger.info(f"WebSocket client connected for session: {session_id}")

    # Ensure session exists
    session = session_manager.get_or_create(session_id)
    audio_accumulator = AudioAccumulator(session_id)
    live_transcriber: GeminiLiveTranscriber = None

    # Safe send helper
    async def safe_send(data: dict):
        try:
            await websocket.send_json(data)
        except Exception as e:
            logger.debug(f"Failed sending WS message to {session_id}: {e}")

    # Callbacks for Gemini Live
    def on_interim(text: str):
        session_manager.add_live_interim(session_id, text)
        asyncio.create_task(
            safe_send({
                "type": "transcript.interim",
                "text": text,
                "session_id": session_id
            })
        )

    def on_final(text: str):
        session_manager.add_live_final(session_id, text)
        asyncio.create_task(
            safe_send({
                "type": "transcript.final",
                "text": text,
                "session_id": session_id
            })
        )

    def on_error(err_msg: str):
        asyncio.create_task(
            safe_send({
                "type": "error",
                "code": "GEMINI_LIVE_ERROR",
                "message": err_msg
            })
        )

    # Acknowledge connection
    await safe_send({
        "type": "connected",
        "session_id": session_id
    })

    try:
        while True:
            message = await websocket.receive()

            # 1. TEXT MESSAGES (Control signals)
            if "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type")

                    if msg_type == "start":
                        lang_mode = payload.get("language_mode", "auto")
                        session_manager.start_recording(session_id, language_mode=lang_mode)

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
                        logger.info(f"Stop signal received for session: {session_id}")
                        session_manager.set_processing(session_id)

                        # Stop live transcription
                        if live_transcriber:
                            await live_transcriber.stop()
                            live_transcriber = None

                        # Stage 1: Final transcription & Diarization
                        await safe_send({
                            "type": "processing",
                            "stage": "final_transcription"
                        })

                        wav_bytes = audio_accumulator.get_wav_bytes()
                        live_transcript_text = session_manager.get_live_transcript_text(session_id)
                        logger.info(f"[{session_id}] Forwarding live transcript ({len(live_transcript_text)} chars) to post-recording diarization.")

                        # Stage 2: Speaker Diarization
                        await safe_send({
                            "type": "processing",
                            "stage": "speaker_diarization"
                        })

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
                            final_data = FinalTranscriptData(language=session.language_mode, segments=[])

                        # Stage 3: Grounded Summarization
                        await safe_send({
                            "type": "processing",
                            "stage": "summarization"
                        })

                        try:
                            summary = await meeting_summarizer.summarize_transcript(final_data)
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

                        # Stage 4: Completed
                        await safe_send({
                            "type": "complete",
                            "session_id": session_id
                        })

                        # Cleanup temporary recording
                        await audio_accumulator.cleanup()

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
                audio_accumulator.append_pcm(pcm_chunk)
                if live_transcriber:
                    await live_transcriber.send_audio_chunk(pcm_chunk)

    except (WebSocketDisconnect, RuntimeError):
        logger.info(f"WebSocket disconnected for session: {session_id}")
    except Exception as e:
        logger.error(f"Unexpected WebSocket error: {e}")
    finally:
        if live_transcriber:
            await live_transcriber.stop()
        await audio_accumulator.cleanup()
