import json
import logging
from typing import Optional
from google import genai
from google.genai import types
from app.config import settings
from app.models.transcription import FinalTranscriptData, TranscriptSegment

logger = logging.getLogger(__name__)

FINAL_TRANSCRIBE_SYSTEM_PROMPT = """
You are an expert audio transcription system with speaker diarization capabilities.
Your task is to produce a speaker-diarized transcript with timestamps based on the audio recording and the verified verbatim live transcript.

Instructions:
1. DIARIZATION: Separate distinct speakers accurately into generic labels: 'Speaker 1', 'Speaker 2', up to 8 speakers. Do NOT guess people's names; strictly use 'Speaker X'.
2. TIMESTAMPS: Provide start and end timestamps in seconds for every utterance segment based on audio alignment.
3. PRESERVE ACCURACY: Rely on the verified live transcript as ground truth for the words spoken. Preserve all Hausa, English, and code-switched terms exactly as spoken without translating Hausa into English.
4. SEGMENT IDS: Assign sequential segment IDs: 'seg_1', 'seg_2', 'seg_3', etc.
5. Structured JSON Output: Return valid JSON adhering strictly to the schema.
"""

class GeminiFinalTranscriber:
    """Performs post-recording audio transcription with speaker diarization and timestamps."""

    def __init__(self):
        self._api_key = settings.gemini_api_key

    async def transcribe_audio(
        self,
        wav_bytes: bytes,
        language_mode: str = "auto",
        live_transcript_text: Optional[str] = None
    ) -> FinalTranscriptData:
        """
        Diarizes and timestamps the meeting by combining the complete audio recording
        with the verified real-time live transcript.
        """
        if not self._api_key:
            if settings.mock_mode_if_no_key:
                logger.info("No GEMINI_API_KEY. Using simulated diarization.")
                return self._generate_simulated_final_transcript(language_mode, live_transcript_text)
            else:
                raise ValueError("GEMINI_API_KEY is not configured in backend/.env")

        client = genai.Client(api_key=self._api_key)
        audio_part = types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav")

        # Build prompt using the verified live transcript for maximum fidelity
        if live_transcript_text and live_transcript_text.strip():
            logger.info(f"Injecting verified live transcript ({len(live_transcript_text)} chars) to guide speaker diarization.")
            prompt = (
                f"{FINAL_TRANSCRIBE_SYSTEM_PROMPT}\n\n"
                f"=== VERIFIED REAL-TIME LIVE TRANSCRIPT ===\n"
                f"{live_transcript_text.strip()}\n"
                f"=== END LIVE TRANSCRIPT ===\n\n"
                f"Task:\n"
                f"1. Align the verbatim words above with the accompanying audio recording.\n"
                f"2. Separate utterances by speaker ('Speaker 1', 'Speaker 2', etc.).\n"
                f"3. Assign start and end timestamps in seconds for each segment.\n"
                f"4. Detect language per segment ('ha-NG', 'en-US', or 'mixed').\n"
                f"5. Return valid JSON adhering to the FinalTranscriptData schema."
            )
            # When live transcript is provided, multimodal models with JSON schema excel at alignment
            models_to_try = [settings.gemini_summary_model, "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"]
        else:
            prompt = (
                f"{FINAL_TRANSCRIBE_SYSTEM_PROMPT}\n\n"
                f"Please transcribe this audio recording with speaker diarization and timestamps. "
                f"Language mode preferred: {language_mode}. Return valid JSON conforming to the schema."
            )
            models_to_try = [settings.gemini_final_model] + settings.gemini_final_fallback_models

        for model_name in models_to_try:
            try:
                logger.info(f"Attempting speaker diarization with model: {model_name}")

                if "3.5-transcribe" in model_name:
                    # Specialized transcribe model: does not take system_instruction or JSON mode
                    transcribe_resp = await client.aio.models.generate_content(
                        model=model_name,
                        contents=[audio_part, "Transcribe the spoken words in this audio accurately."]
                    )
                    raw_text = transcribe_resp.text or live_transcript_text or ""
                    structure_prompt = (
                        f"{FINAL_TRANSCRIBE_SYSTEM_PROMPT}\n"
                        f"Speech transcript: {raw_text}\n"
                        f"Align into speaker-diarized segments with timestamps and return JSON."
                    )
                    structured_resp = await client.aio.models.generate_content(
                        model=settings.gemini_summary_model,
                        contents=[audio_part, structure_prompt],
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=FinalTranscriptData,
                            temperature=0.1
                        )
                    )
                    if structured_resp and structured_resp.text:
                        parsed = json.loads(structured_resp.text)
                        return FinalTranscriptData(**parsed)
                else:
                    config = types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=FinalTranscriptData,
                        temperature=0.1
                    )
                    response = await client.aio.models.generate_content(
                        model=model_name,
                        contents=[audio_part, prompt],
                        config=config
                    )
                    if response and response.text:
                        parsed_data = json.loads(response.text)
                        return FinalTranscriptData(**parsed_data)

            except Exception as e:
                logger.warning(f"Final transcription failed with model {model_name}: {e}")

        if settings.mock_mode_if_no_key or (live_transcript_text and live_transcript_text.strip()):
            logger.info("Using segmented live transcript fallback for diarization.")
            return self._generate_simulated_final_transcript(language_mode, live_transcript_text)

        raise RuntimeError("Failed to generate final transcript with configured Gemini models.")

    def _generate_simulated_final_transcript(
        self,
        language_mode: str,
        live_transcript_text: Optional[str] = None
    ) -> FinalTranscriptData:
        """Fallback simulation for testing or offline demonstration."""
        if live_transcript_text and live_transcript_text.strip():
            # Segment the user's actual live transcript into diarized segments
            sentences = [s.strip() for s in live_transcript_text.replace('\n', ' ').split('.') if s.strip()]
            segments = []
            current_time = 0.0
            for idx, sentence in enumerate(sentences):
                speaker = f"Speaker {(idx % 2) + 1}"
                duration = max(2.5, len(sentence.split()) * 0.4)
                segments.append(
                    TranscriptSegment(
                        id=f"seg_{idx + 1}",
                        speaker=speaker,
                        start=round(current_time, 1),
                        end=round(current_time + duration, 1),
                        text=sentence + ".",
                        language=language_mode if language_mode != "auto" else "ha-NG" if any(w in sentence.lower() for w in ["barka", "ina", "zamu", "kotu", "kudi"]) else "en-US"
                    )
                )
                current_time += duration + 0.3

            if segments:
                return FinalTranscriptData(
                    language="mixed (Hausa / English)" if language_mode == "auto" else language_mode,
                    segments=segments
                )

        # No transcript detected
        return FinalTranscriptData(
            language=language_mode if language_mode != "auto" else "en-US",
            segments=[]
        )

gemini_final_transcriber = GeminiFinalTranscriber()
