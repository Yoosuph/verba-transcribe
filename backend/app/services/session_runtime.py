"""Per-session live runtime: survives WebSocket reconnects.

Holds the audio accumulator and Gemini Live transcriber for the duration of a
recording session so a dropped socket does not lose audio or force a restart.
Outbound events are broadcast to every currently attached WebSocket.
"""
import asyncio
import logging
import time
from typing import Optional, Set

from app.services.audio_recorder import AudioAccumulator
from app.services.gemini_live import GeminiLiveTranscriber
from app.services.session_manager import session_manager

logger = logging.getLogger(__name__)

# How long a runtime waits for the client to reconnect before finalizing an
# orphaned recording (client vanished without sending stop).
ORPHAN_GRACE_SECONDS = 90
ORPHAN_CHECK_INTERVAL = 15


class SessionRuntime:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.accumulator = AudioAccumulator(session_id)
        self.live_transcriber: Optional[GeminiLiveTranscriber] = None
        self.started = False
        self.stopping = False
        self.limit_hit = False
        self.processing_task: Optional[asyncio.Task] = None
        self.subscribers: Set[object] = set()  # WebSocket-like objects with send_json
        self.last_detach: Optional[float] = None
        self._orphan_task: Optional[asyncio.Task] = None
        self._bg_tasks: Set[asyncio.Task] = set()

    # ------------------------------------------------------------ subscribers
    def attach(self, websocket) -> None:
        self.subscribers.add(websocket)
        self.last_detach = None

    def detach(self, websocket) -> None:
        self.subscribers.discard(websocket)
        if not self.subscribers and self.last_detach is None and not self.stopping:
            self.last_detach = time.monotonic()
            if self._orphan_task is None or self._orphan_task.done():
                self._orphan_task = asyncio.create_task(self._orphan_watch())

    def broadcast(self, data: dict) -> None:
        """Fire-and-forget send to every attached socket; dead sockets are dropped."""
        for ws in list(self.subscribers):
            self.spawn(self._safe_send(ws, data))

    async def _safe_send(self, ws, data: dict) -> None:
        try:
            await ws.send_json(data)
        except Exception:
            self.subscribers.discard(ws)

    def spawn(self, coro) -> asyncio.Task:
        task = asyncio.create_task(coro)
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)
        return task

    # -------------------------------------------------------------- lifecycle
    async def _orphan_watch(self) -> None:
        try:
            while True:
                await asyncio.sleep(ORPHAN_CHECK_INTERVAL)
                if self.stopping:
                    return
                if self.subscribers:
                    self.last_detach = None
                    return
                if self.last_detach is None:
                    continue
                if time.monotonic() - self.last_detach >= ORPHAN_GRACE_SECONDS:
                    logger.info(
                        "[%s] No client reconnected within %ss; finalizing orphaned recording.",
                        self.session_id, ORPHAN_GRACE_SECONDS,
                    )
                    from app.websocket.transcription import stop_and_process_runtime
                    await stop_and_process_runtime(self, reason="orphan")
                    return
        except asyncio.CancelledError:
            pass

    async def start_live(self, language_mode: str) -> bool:
        await self.stop_live()
        session_manager.start_recording(self.session_id, language_mode=language_mode)

        def on_interim(text: str):
            session_manager.add_live_interim(self.session_id, text)
            self.broadcast({"type": "transcript.interim", "text": text, "session_id": self.session_id})

        def on_final(text: str):
            session_manager.add_live_final(self.session_id, text)
            self.broadcast({"type": "transcript.final", "text": text, "session_id": self.session_id})

        def on_error(err_msg: str):
            self.broadcast({
                "type": "error",
                "code": "GEMINI_LIVE_ERROR",
                "message": err_msg,
                "session_id": self.session_id,
            })

        self.live_transcriber = GeminiLiveTranscriber(
            session_id=self.session_id,
            language_mode=language_mode,
            on_interim=on_interim,
            on_final=on_final,
            on_error=on_error,
        )
        started = await self.live_transcriber.start()
        if started:
            self.started = True
        else:
            self.live_transcriber = None
        return started

    async def stop_live(self) -> None:
        if self.live_transcriber:
            try:
                await self.live_transcriber.stop()
            except Exception as e:
                logger.warning("[%s] Error stopping live transcriber: %s", self.session_id, e)
            self.live_transcriber = None

    def send_audio(self, pcm_chunk: bytes) -> None:
        if self.stopping:
            return
        self.accumulator.append_pcm(pcm_chunk)
        if self.live_transcriber:
            self.live_transcriber.send_audio_chunk(pcm_chunk)

    async def dispose(self) -> None:
        await self.stop_live()
        if self._orphan_task and not self._orphan_task.done():
            self._orphan_task.cancel()
        await self.accumulator.cleanup()


class SessionRuntimeRegistry:
    def __init__(self):
        self._runtimes: dict = {}

    def get(self, session_id: str) -> Optional[SessionRuntime]:
        return self._runtimes.get(session_id)

    def get_or_create(self, session_id: str) -> SessionRuntime:
        rt = self._runtimes.get(session_id)
        if rt is None:
            rt = SessionRuntime(session_id)
            self._runtimes[session_id] = rt
        return rt

    def remove(self, session_id: str) -> None:
        self._runtimes.pop(session_id, None)

    def clear(self) -> None:
        self._runtimes.clear()


runtime_registry = SessionRuntimeRegistry()
