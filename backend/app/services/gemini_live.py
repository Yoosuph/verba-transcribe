import asyncio
import logging
from typing import Callable, Optional, List
from google import genai
from google.genai import types
from app.config import settings

logger = logging.getLogger(__name__)

LIVE_CONNECT_TIMEOUT_SECONDS = 5.0
MAX_RECONNECT_ATTEMPTS = 5
RECONNECT_BASE_DELAY_SECONDS = 1.0


class GeminiLiveTranscriber:
    """
    Manages real-time bidirectional streaming with Gemini Live API using google-genai SDK.
    Maintains persistent async with session context to stream 16kHz mono PCM chunks and
    dispatch interim and final transcript events. Automatically reconnects (with backoff)
    when Gemini closes the session (go_away) or the upstream connection errors.
    """

    def __init__(
        self,
        session_id: str,
        language_mode: str = "auto",
        on_interim: Optional[Callable[[str], None]] = None,
        on_final: Optional[Callable[[str], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ):
        self.session_id = session_id
        self.language_mode = language_mode
        self.on_interim = on_interim
        self.on_final = on_final
        self.on_error = on_error

        self._client: Optional[genai.Client] = None
        self._session = None
        self._is_running = False
        # Bounded queue: live transcription tolerates chunk loss better than
        # unbounded memory growth if the upstream connection stalls.
        self._send_queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue(maxsize=512)
        self._session_task: Optional[asyncio.Task] = None
        self._connected_event = asyncio.Event()
        self._mock_mode = False
        self._audio_chunk_count = 0
        self._models: List[str] = []
        self._model_index = 0

    def _get_language_codes(self) -> Optional[List[str]]:
        if self.language_mode == "ha":
            return ["ha-NG", "ha"]
        elif self.language_mode == "en":
            return ["en-US", "en"]
        return ["ha-NG", "en-US", "ha", "en"]

    async def start(self) -> bool:
        """Establishes connection to Gemini Live session within an active async context."""
        self._is_running = True
        self._connected_event.clear()

        api_key = settings.gemini_api_key
        if not api_key:
            if settings.mock_mode_if_no_key:
                logger.info(f"[{self.session_id}] No GEMINI_API_KEY configured. Running in simulated live mode.")
                self._mock_mode = True
                self._session_task = asyncio.create_task(self._mock_transcription_loop())
                return True
            else:
                if self.on_error:
                    self.on_error("GEMINI_API_KEY is not configured in backend/.env")
                return False

        self._client = genai.Client(api_key=api_key)
        self._models = [settings.gemini_live_model] + list(settings.gemini_live_fallback_models)
        self._model_index = 0
        config = types.LiveConnectConfig(
            response_modalities=[types.Modality.TEXT],
            input_audio_transcription=types.AudioTranscriptionConfig(
                language_codes=self._get_language_codes(),
                mode=types.AudioTranscriptionConfigMode.SMART,
            ),
            system_instruction=(
                "You are an accurate live speech transcription system. "
                "Transcribe the user's spoken audio verbatim in real time. "
                "Accurately capture Hausa, English, or mixed English/Hausa speech without translating to English, "
                "without adding commentary, and without omitting words."
            )
        )

        # Launch the persistent session runner (handles connect + reconnects)
        self._session_task = asyncio.create_task(self._run_live_session(config))

        try:
            await asyncio.wait_for(self._connected_event.wait(), timeout=LIVE_CONNECT_TIMEOUT_SECONDS)
            logger.info(f"[{self.session_id}] Successfully established Live session.")
            return True
        except asyncio.TimeoutError:
            # First attempt failed; the runner keeps retrying in background —
            # give the retries a moment before declaring failure.
            try:
                await asyncio.wait_for(self._connected_event.wait(), timeout=LIVE_CONNECT_TIMEOUT_SECONDS * 4)
                logger.info(f"[{self.session_id}] Live session established after retry.")
                return True
            except asyncio.TimeoutError:
                logger.error(f"[{self.session_id}] Could not establish Gemini Live session.")
                await self.stop()
                # Mock is only permitted when no key is configured — never as a
                # silent substitute for a real model failure.
                if not settings.gemini_api_key and settings.mock_mode_if_no_key:
                    self._mock_mode = True
                    self._is_running = True
                    self._session_task = asyncio.create_task(self._mock_transcription_loop())
                    return True
                if self.on_error:
                    self.on_error("Could not connect to Gemini Live service.")
                return False

    async def _run_live_session(self, config: types.LiveConnectConfig) -> None:
        """Connects, streams, and transparently reconnects with backoff while running."""
        attempt = 0
        ever_connected = False
        try:
            while self._is_running:
                model_name = self._pick_model()
                try:
                    logger.info(f"[{self.session_id}] Connecting to Gemini Live with model: {model_name}")
                    async with self._client.aio.live.connect(
                        model=model_name, config=config
                    ) as session:
                        self._session = session
                        self._connected_event.set()
                        attempt = 0  # successful connection resets backoff
                        ever_connected = True

                        send_task = asyncio.create_task(self._send_loop(session))
                        receive_task = asyncio.create_task(self._receive_loop(session))

                        done, pending = await asyncio.wait(
                            [send_task, receive_task],
                            return_when=asyncio.FIRST_EXCEPTION
                        )
                        for task in pending:
                            task.cancel()
                        for task in done:
                            exc = task.exception()
                            if exc and self._is_running:
                                raise exc

                    if not self._is_running:
                        break
                    # Session closed cleanly (e.g. go_away) while we still want to run
                    logger.warning(f"[{self.session_id}] Live session closed; reconnecting...")
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    if not self._is_running:
                        break
                    if "1000" in str(e):
                        logger.info(f"[{self.session_id}] Gemini Live connection closed normally.")
                        break
                    logger.error(f"[{self.session_id}] Gemini Live session error: {e}")
                    if self.on_error:
                        self.on_error(f"Gemini Live error: {e}")
                    # Connection failed — advance to the next configured model
                    if self._models and not ever_connected:
                        self._model_index = min(self._model_index + 1, len(self._models) - 1)
                    elif ever_connected and self._models and self._model_index < len(self._models) - 1:
                        # After a mid-session failure try primary again first; only step
                        # down through fallbacks after the primary fails repeatedly.
                        pass

                if not self._is_running:
                    break

                attempt += 1
                if attempt > MAX_RECONNECT_ATTEMPTS:
                    logger.error(f"[{self.session_id}] Giving up after {MAX_RECONNECT_ATTEMPTS} reconnect attempts.")
                    if self.on_error:
                        self.on_error("Live transcription connection lost; could not reconnect.")
                    break

                delay = RECONNECT_BASE_DELAY_SECONDS * (2 ** (attempt - 1))
                logger.info(f"[{self.session_id}] Reconnecting in {delay}s (attempt {attempt})...")
                await asyncio.sleep(delay)
        finally:
            self._session = None

    def _pick_model(self) -> str:
        if not self._models:
            self._models = [settings.gemini_live_model] + list(settings.gemini_live_fallback_models)
        return self._models[self._model_index % len(self._models)]

    def send_audio_chunk(self, pcm_data: bytes) -> None:
        """Queues a 16-bit 16kHz mono PCM chunk to be forwarded to Gemini (non-blocking)."""
        if not self._is_running:
            return
        self._audio_chunk_count += 1
        try:
            self._send_queue.put_nowait(pcm_data)
        except asyncio.QueueFull:
            # Backpressure: drop the oldest chunk rather than stall the socket loop
            try:
                self._send_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                self._send_queue.put_nowait(pcm_data)
            except asyncio.QueueFull:
                logger.warning("[%s] Gemini send queue full; audio chunk dropped.", self.session_id)

    async def _send_loop(self, session) -> None:
        """Sends audio chunks from queue to Gemini Live."""
        try:
            while self._is_running:
                chunk = await self._send_queue.get()
                if chunk is None:
                    break
                blob = types.Blob(data=chunk, mime_type="audio/pcm;rate=16000")
                await session.send_realtime_input(audio=blob)
                self._send_queue.task_done()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            if self._is_running:
                logger.error(f"[{self.session_id}] Error in send loop: {e}")
                raise

    async def _receive_loop(self, session) -> None:
        """Listens for live transcription events from Gemini Live."""
        try:
            async for message in session.receive():
                if not self._is_running:
                    break

                if message.server_content:
                    content = message.server_content

                    # Interim transcription (real-time streaming text)
                    if content.interim_input_transcription and content.interim_input_transcription.text:
                        text = content.interim_input_transcription.text.strip()
                        if text and self.on_interim:
                            self.on_interim(text)

                    # Final live segment transcription
                    if content.input_transcription and content.input_transcription.text:
                        text = content.input_transcription.text.strip()
                        if text and self.on_final:
                            self.on_final(text)

                if message.go_away:
                    logger.warning(f"[{self.session_id}] Gemini Live received go_away message.")
                    break

        except asyncio.CancelledError:
            pass
        except Exception as e:
            if "1000" in str(e) or not self._is_running:
                logger.info(f"[{self.session_id}] Receive loop closed gracefully.")
            else:
                logger.error(f"[{self.session_id}] Error in receive loop: {e}")
                raise

    async def _mock_transcription_loop(self) -> None:
        """Fallback simulation — only reachable when no API key is configured."""
        sample_dialogues = [
            ("Barkan ku da", "Barkan ku da warhaka, yau zamu tattauna batun kasafin kudin mu."),
            ("Good morning everyone,", "Good morning everyone, we are reviewing the agenda for this week."),
            ("Dangane da batun", "Dangane da batun kasafin kudi, mun amince a kammala rubuta rahoton kafin ranar Juma'a."),
            ("Mr. Chairman, regarding", "Mr. Chairman, regarding the budget review, the finance team has circulated the latest figures."),
            ("Muna bukatar", "Muna bukatar kowane sashe ya gabatar da lissafin ayyukan da aka kammala."),
            ("Action item is clear:", "Action item is clear: the coordinator will distribute the updated agenda by 4:00 PM tomorrow.")
        ]

        dialogue_idx = 0
        try:
            while self._is_running:
                chunk = await self._send_queue.get()
                if chunk is None:
                    break
                self._send_queue.task_done()

                if self._audio_chunk_count > 0 and self._audio_chunk_count % 25 == 0:
                    current_interim, current_final = sample_dialogues[dialogue_idx % len(sample_dialogues)]
                    if self.on_interim:
                        self.on_interim(current_interim)
                    await asyncio.sleep(0.3)
                    if self.on_final:
                        self.on_final(current_final)
                    dialogue_idx += 1

        except asyncio.CancelledError:
            pass

    async def stop(self) -> None:
        """Stops the live transcription session cleanly."""
        self._is_running = False
        try:
            self._send_queue.put_nowait(None)
        except asyncio.QueueFull:
            pass

        if self._session_task:
            self._session_task.cancel()
            try:
                await self._session_task
            except asyncio.CancelledError:
                pass
            self._session_task = None

        logger.info(f"[{self.session_id}] GeminiLiveTranscriber stopped.")
