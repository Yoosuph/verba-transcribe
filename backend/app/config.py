import re
import os
from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

# Safe session IDs: letters, digits, underscore, dash only (blocks path traversal)
SESSION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def is_valid_session_id(session_id: str) -> bool:
    """True if the session ID is safe to use in file paths and URLs."""
    return bool(session_id) and bool(SESSION_ID_PATTERN.match(session_id))

class Settings(BaseSettings):
    gemini_api_key: str = ""
    # Live path: dedicated low-latency live-transcription model (docs: Live API transcription)
    gemini_live_model: str = "gemini-3.5-transcribe-live"
    # Fallback if the dedicated live transcriber is unavailable (gemini-2.0-flash is shut down)
    gemini_live_fallback_models: List[str] = ["gemini-3.8-live"]
    # Final path: dedicated non-streaming transcription model (native diarization, up to 8 speakers)
    gemini_final_model: str = "gemini-3.5-transcribe"
    gemini_final_fallback_models: List[str] = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"]
    # Summary / judicial report: most capable audio-capable model receives the FULL recording + transcript
    gemini_summary_model: str = "gemini-3.8-flash"
    gemini_summary_fallback_models: List[str] = ["gemini-3.5-flash", "gemini-flash-latest"]
    cors_origins: Union[List[str], str] = ["*"]
    max_session_minutes: int = 30
    max_audio_size_mb: int = 100
    mock_mode_if_no_key: bool = True
    temp_audio_dir: str = "/tmp/judiciary_audio"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
