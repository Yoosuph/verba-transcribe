import os
from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator

class Settings(BaseSettings):
    gemini_api_key: str = ""
    gemini_live_model: str = "gemini-3.5-transcribe-live"
    gemini_live_fallback_models: List[str] = ["gemini-2.0-flash", "gemini-2.0-flash-exp"]
    gemini_final_model: str = "gemini-3.5-transcribe"
    gemini_final_fallback_models: List[str] = ["gemini-3.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"]
    gemini_summary_model: str = "gemini-2.5-flash-lite"
    cors_origins: Union[List[str], str] = ["*"]
    max_session_minutes: int = 30
    max_audio_size_mb: int = 100
    mock_mode_if_no_key: bool = True
    temp_audio_dir: str = "/tmp/verba_audio"

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
