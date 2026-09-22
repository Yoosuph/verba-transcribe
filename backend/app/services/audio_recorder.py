import io
import logging
import os
import wave
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


class AudioAccumulator:
    """
    Accumulates raw 16kHz 16-bit mono PCM chunks received from the client,
    streaming them to disk (never buffering the whole recording in RAM).

    A `.pcm.tmp` working file is appended per session; finalize() wraps it in a
    standard WAV header for playback and Gemini upload.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.sample_rate = 16000
        self.num_channels = 1
        self.sample_width = 2  # 16-bit = 2 bytes
        self.file_path: Optional[str] = None
        self.overflowed: bool = False
        self.max_bytes = settings.max_audio_size_mb * 1024 * 1024
        self._total_bytes = 0
        os.makedirs(settings.audio_dir, exist_ok=True)
        self._pcm_path = os.path.join(settings.audio_dir, f"{session_id}.pcm.tmp")
        self._fh = open(self._pcm_path, "wb")

    def append_pcm(self, chunk: bytes) -> None:
        """Appends raw 16-bit mono PCM bytes, enforcing the configured size cap."""
        if not chunk:
            return
        if self._total_bytes + len(chunk) > self.max_bytes:
            self.overflowed = True
            logger.warning(
                "[%s] Audio accumulator reached %.0fMB cap; dropping chunk.",
                self.session_id, self.max_bytes / (1024 * 1024),
            )
            return
        try:
            self._fh.write(chunk)
            self._total_bytes += len(chunk)
        except ValueError:
            # File already closed (e.g. late chunk after cleanup)
            logger.debug("[%s] Ignoring PCM chunk after accumulator closed.", self.session_id)

    @property
    def total_bytes(self) -> int:
        return self._total_bytes

    @property
    def duration_seconds(self) -> float:
        bytes_per_second = self.sample_rate * self.num_channels * self.sample_width
        return self._total_bytes / float(bytes_per_second) if bytes_per_second else 0.0

    @property
    def duration_limit_seconds(self) -> int:
        """Maximum allowed recording duration in seconds from config."""
        return settings.max_session_minutes * 60

    def _close_pcm(self) -> None:
        if self._fh and not self._fh.closed:
            try:
                self._fh.flush()
                self._fh.close()
            except ValueError:
                pass

    def _read_pcm(self) -> bytes:
        self._close_pcm()
        if not os.path.exists(self._pcm_path):
            return b""
        with open(self._pcm_path, "rb") as f:
            return f.read()

    def get_wav_bytes(self) -> bytes:
        """Encodes accumulated PCM data into standard RIFF WAV bytes (in-memory)."""
        pcm = self._read_pcm()
        wav_io = io.BytesIO()
        with wave.open(wav_io, "wb") as wav_file:
            wav_file.setnchannels(self.num_channels)
            wav_file.setsampwidth(self.sample_width)
            wav_file.setframerate(self.sample_rate)
            wav_file.writeframes(pcm)
        return wav_io.getvalue()

    def finalize_wav(self) -> str:
        """Writes the final WAV to {audio_dir}/{session_id}.wav without loading PCM into RAM."""
        self._close_pcm()
        wav_path = os.path.join(settings.audio_dir, f"{self.session_id}.wav")
        with wave.open(wav_path, "wb") as wav_file:
            wav_file.setnchannels(self.num_channels)
            wav_file.setsampwidth(self.sample_width)
            wav_file.setframerate(self.sample_rate)
            if os.path.exists(self._pcm_path):
                # Stream the raw PCM payload into the WAV data chunk in bounded slices
                with open(self._pcm_path, "rb") as pcm_file:
                    while True:
                        slice_ = pcm_file.read(65536)
                        if not slice_:
                            break
                        wav_file.writeframesraw(slice_)
        self.file_path = wav_path
        return wav_path

    async def save_recording(self) -> str:
        """Finalizes the persistent WAV file for playback and replay."""
        return self.finalize_wav()

    async def save_to_file(self) -> str:
        """Legacy helper, maps to save_recording."""
        return await self.save_recording()

    async def cleanup(self) -> None:
        """Frees the working PCM file; the finalized WAV remains on disk for replay."""
        self._close_pcm()
        try:
            if os.path.exists(self._pcm_path):
                os.remove(self._pcm_path)
        except OSError as e:
            logger.warning("[%s] Failed removing PCM working file: %s", self.session_id, e)
