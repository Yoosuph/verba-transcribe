import io
import logging
import os
import wave
import aiofiles
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)

class AudioAccumulator:
    """
    Accumulates raw 16kHz 16-bit mono PCM chunks received from the client
    and encodes them into standard WAV files or in-memory byte buffers for Gemini.
    """
    def __init__(self, session_id: str):
        self.session_id = session_id
        self._pcm_buffer = bytearray()
        self.sample_rate = 16000
        self.num_channels = 1
        self.sample_width = 2  # 16-bit = 2 bytes
        self.file_path: Optional[str] = None
        self.overflowed: bool = False
        self.max_bytes = settings.max_audio_size_mb * 1024 * 1024
        os.makedirs(settings.temp_audio_dir, exist_ok=True)

    def append_pcm(self, chunk: bytes) -> None:
        """Appends raw 16-bit mono PCM bytes, enforcing the configured size cap."""
        if not chunk:
            return
        if len(self._pcm_buffer) + len(chunk) > self.max_bytes:
            self.overflowed = True
            logger.warning(
                "[%s] Audio accumulator reached %.0fMB cap; dropping chunk.",
                self.session_id, self.max_bytes / (1024 * 1024),
            )
            return
        self._pcm_buffer.extend(chunk)

    @property
    def total_bytes(self) -> int:
        return len(self._pcm_buffer)

    @property
    def duration_seconds(self) -> float:
        bytes_per_second = self.sample_rate * self.num_channels * self.sample_width
        return len(self._pcm_buffer) / float(bytes_per_second) if bytes_per_second else 0.0

    @property
    def duration_limit_seconds(self) -> int:
        """Maximum allowed recording duration in seconds from config."""
        return settings.max_session_minutes * 60

    def get_wav_bytes(self) -> bytes:
        """Encodes accumulated PCM data into standard RIFF WAV bytes."""
        wav_io = io.BytesIO()
        with wave.open(wav_io, "wb") as wav_file:
            wav_file.setnchannels(self.num_channels)
            wav_file.setsampwidth(self.sample_width)
            wav_file.setframerate(self.sample_rate)
            wav_file.writeframes(bytes(self._pcm_buffer))
        return wav_io.getvalue()

    async def save_recording(self) -> str:
        """Saves accumulated audio as a persistent WAV file for playback and replay."""
        filename = f"{self.session_id}.wav"
        self.file_path = os.path.join(settings.temp_audio_dir, filename)
        wav_bytes = self.get_wav_bytes()
        async with aiofiles.open(self.file_path, "wb") as f:
            await f.write(wav_bytes)
        return self.file_path

    async def save_to_file(self) -> str:
        """Legacy helper, maps to save_recording."""
        return await self.save_recording()

    async def cleanup(self) -> None:
        """Frees in-memory buffer while retaining saved audio on disk for replay."""
        self._pcm_buffer.clear()
        self.overflowed = False
