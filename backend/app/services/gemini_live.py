import asyncio
import logging
from typing import Callable, Optional, List
from google import genai
from google.genai import types
from app.config import settings

logger = logging.getLogger(__name__)

class GeminiLiveTranscriber:
    """
    Manages real-time bidirectional streaming with Gemini Live API using google-genai SDK.
    Maintains persistent async with session context to stream 16kHz mono PCM chunks and
    dispatch interim and final transcript events.
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

        models_to_try = [settings.gemini_live_model] + settings.gemini_live_fallback_models

        for model_name in models_to_try:
            try:
                logger.info(f"[{self.session_id}] Connecting to Gemini Live with model: {model_name}")
                self._client = genai.Client(api_key=api_key)

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

                # Launch persistent session task maintaining the async context manager
                self._session_task = asyncio.create_task(self._run_live_session(model_name, config))

                # Wait up to 5 seconds for connection establishment
                try:
                    await asyncio.wait_for(self._connected_event.wait(), timeout=5.0)
                    logger.info(f"[{self.session_id}] Successfully established Live session with {model_name}")
                    return True
                except asyncio.TimeoutError:
                    logger.warning(f"[{self.session_id}] Timeout establishing session with {model_name}")
                    if self._session_task:
                        self._session_task.cancel()
                        self._session_task = None

            except Exception as e:
                logger.warning(f"[{self.session_id}] Failed connecting with model {model_name}: {e}")

        logger.error(f"[{self.session_id}] All Gemini Live models failed.")
        if settings.mock_mode_if_no_key:
            logger.info(f"[{self.session_id}] Falling back to simulated live transcription.")
            self._mock_mode = True
            self._session_task = asyncio.create_task(self._mock_transcription_loop())
            return True

        if self.on_error:
            self.on_error("Could not connect to Gemini Live service.")
        return False

    async def _run_live_session(self, model_name: str, config: types.LiveConnectConfig) -> None:
        """
        Runs the persistent async context manager so ws_connect stays active
        for the entire recording session.
        """
        try:
            async with self._client.aio.live.connect(model=model_name, config=config) as session:
                self._session = session
                self._connected_event.set()

                send_task = asyncio.create_task(self._send_loop(session))
                receive_task = asyncio.create_task(self._receive_loop(session))

                done, pending = await asyncio.wait(
                    [send_task, receive_task],
                    return_when=asyncio.FIRST_EXCEPTION
                )

                for task in pending:
                    task.cancel()

        except asyncio.CancelledError:
            pass
        except Exception as e:
            # If 1000 normal close when stopping, ignore
            if "1000" in str(e) and not self._is_running:
                logger.info(f"[{self.session_id}] Gemini Live connection closed normally.")
            else:
                logger.error(f"[{self.session_id}] Gemini Live session error: {e}")
                if self._is_running and self.on_error:
                    self.on_error(f"Gemini Live error: {e}")
        finally:
            self._session = None

    async def send_audio_chunk(self, pcm_data: bytes) -> None:
        """Queues a 16-bit 16kHz mono PCM chunk to be forwarded to Gemini."""
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
            # WebSocket code 1000 is a normal close
            if "1000" in str(e) or not self._is_running:
                logger.info(f"[{self.session_id}] Receive loop closed gracefully.")
            else:
                logger.error(f"[{self.session_id}] Error in receive loop: {e}")
                if self.on_error:
                    self.on_error(f"Gemini Live connection error: {str(e)}")

    async def _mock_transcription_loop(self) -> None:
        """Fallback simulation for offline / testing."""
        sample_dialogues = [
            ("Barkan ku da", "Barkan ku da warhaka, yau zamu tattauna batun tsarin shari'a."),
            ("Good morning everyone,", "Good morning everyone, we are reviewing the pending court schedules for Jigawa state."),
            ("Dangane da batun", "Dangane da batun kasafin kudi, mun amince a kammala rubuta rahoton kafin ranar Juma'a."),
            ("Mr. Chairman, regarding", "Mr. Chairman, regarding the digitisation of case records, the IT team has commenced deployment."),
            ("Muna bukatar", "Muna bukatar kowane sashe ya gabatar da lissafin ayyukan da aka kammala."),
            ("Action item is clear:", "Action item is clear: the registrar will distribute the updated cause list by 4:00 PM tomorrow.")
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
        await self._send_queue.put(None)

        if self._session_task:
            self._session_task.cancel()
            try:
                await self._session_task
            except asyncio.CancelledError:
                pass
            self._session_task = None

        logger.info(f"[{self.session_id}] GeminiLiveTranscriber stopped.")
