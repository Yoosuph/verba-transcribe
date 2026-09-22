import re
from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator

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
    # Simulation mode is ONLY used when no API key is configured. It is never used as a
    # silent fallback when a key is present but a model call fails (failures surface loudly).
    mock_mode_if_no_key: bool = True

    # --- Security -----------------------------------------------------------
    # Shared bearer token. When set, every /api/sessions/* and /ws/* request must
    # present it (Authorization: Bearer, X-Auth-Token, or ?token= for WebSockets).
    # Empty string disables auth (development only; a warning is logged at startup).
    auth_token: str = ""
    # Max LLM-triggering operations per client per minute (0 disables the limit).
    rate_limit_llm_per_minute: int = 6

    # --- Persistence ---------------------------------------------------------
    # Sessions are stored in SQLite at {data_dir}/verba.db; audio under {data_dir}/audio.
    data_dir: str = "data"
    audio_dir: str = ""   # empty -> {data_dir}/audio
    db_path: str = ""     # empty -> {data_dir}/verba.db
    # 0 = keep forever. Sessions are only removed when retention_days > 0 and expired.
    session_retention_days: int = 0
    # 0 = keep forever. Applies to recorded WAV files only.
    audio_retention_days: int = 30

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    @model_validator(mode="after")
    def _derive_paths(self) -> "Settings":
        import os
        # Anchor a relative data_dir to the backend package root so the DB/audio
        # location never depends on the process working directory (CWD-relative
        # paths previously split data across ./data and backend/data).
        if not os.path.isabs(self.data_dir):
            backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            self.data_dir = os.path.join(backend_root, self.data_dir)
        if not self.audio_dir:
            self.audio_dir = os.path.join(self.data_dir, "audio")
        if not self.db_path:
            self.db_path = os.path.join(self.data_dir, "verba.db")
        return self

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
