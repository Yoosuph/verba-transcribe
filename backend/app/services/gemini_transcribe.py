import json
import logging
from typing import Optional
from google import genai
from google.genai import types
from app.config import settings
from app.models.transcription import FinalTranscriptData, TranscriptSegment
from app.services.gemini_retry import call_with_retry

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

# Cap on live-transcript text injected into prompts (defense against unbounded
# prompt growth and a basic prompt-injection surface).
MAX_GUIDANCE_CHARS = 20_000


class GeminiFinalTranscriber:
    """Performs post-recording audio transcription with speaker diarization and timestamps."""

    @property
    def _api_key(self) -> str:
        return settings.gemini_api_key

    def _audio_part(
        self,
        audio_part: Optional[types.Part],
        wav_bytes: Optional[bytes],
        wav_path: Optional[str],
    ) -> types.Part:
        """Prefers a pre-uploaded Files API part; falls back to inline bytes or a path read."""
        if audio_part is not None:
            return audio_part
        if wav_path:
            return types.Part.from_bytes(data=open(wav_path, "rb").read(), mime_type="audio/wav")
        if wav_bytes:
            return types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav")
        raise ValueError("No audio provided for transcription")

    async def transcribe_audio(
        self,
        wav_bytes: Optional[bytes] = None,
        language_mode: str = "auto",
        live_transcript_text: Optional[str] = None,
        audio_part: Optional[types.Part] = None,
        wav_path: Optional[str] = None,
    ) -> FinalTranscriptData:
        """
        Diarizes and timestamps the meeting by combining the complete audio recording
        with the verified real-time live transcript.

        `audio_part` (a Files API part) is preferred so the recording is uploaded
        once and reused across the raw-transcribe and structuring calls.
        """
        if not self._api_key:
            if settings.mock_mode_if_no_key:
                logger.info("No GEMINI_API_KEY. Using simulated diarization.")
                return self.segment_live_transcript(language_mode, live_transcript_text)
            else:
                raise ValueError("GEMINI_API_KEY is not configured in backend/.env")

        client = genai.Client(api_key=self._api_key)
        audio = self._audio_part(audio_part, wav_bytes, wav_path)

        # Dedicated transcription model produces the raw verbatim text;
        # the capable summary model structures it into diarized JSON segments.
        raw_models = [settings.gemini_final_model] + settings.gemini_final_fallback_models
        structure_models = [settings.gemini_summary_model] + settings.gemini_summary_fallback_models

        guidance = (live_transcript_text or "").strip()
        if len(guidance) > MAX_GUIDANCE_CHARS:
            guidance = guidance[:MAX_GUIDANCE_CHARS]

        if guidance:
            logger.info(f"Injecting verified live transcript ({len(guidance)} chars) to guide speaker diarization.")
            alignment_instructions = (
                f"1. Align the verbatim words in the VERIFIED REAL-TIME LIVE TRANSCRIPT below with the accompanying audio recording.\n"
                f"2. Separate utterances by speaker ('Speaker 1', 'Speaker 2', etc.).\n"
                f"3. Assign start and end timestamps in seconds for each segment.\n"
                f"4. Detect language per segment ('ha-NG', 'en-US', or 'mixed').\n"
                f"5. Return valid JSON adhering to the FinalTranscriptData schema.\n\n"
                f"=== VERIFIED REAL-TIME LIVE TRANSCRIPT ===\n"
                f"{guidance}\n"
                f"=== END LIVE TRANSCRIPT ==="
            )
        else:
            alignment_instructions = (
                f"1. Transcribe the spoken words in the accompanying audio recording accurately.\n"
                f"2. Separate utterances by speaker ('Speaker 1', 'Speaker 2', etc.).\n"
                f"3. Assign start and end timestamps in seconds for each segment.\n"
                f"4. Detect language per segment ('ha-NG', 'en-US', or 'mixed').\n"
                f"5. Language mode preferred: {language_mode}.\n"
                f"6. Return valid JSON adhering to the FinalTranscriptData schema."
            )

        structure_prompt = (
            f"{FINAL_TRANSCRIBE_SYSTEM_PROMPT}\n\n"
            f"{alignment_instructions}"
        )

        # Pass 1: raw verbatim text from the dedicated transcription model (if any)
        raw_text: Optional[str] = None
        for model_name in raw_models:
            try:
                logger.info(f"Attempting raw transcription with model: {model_name}")
                transcribe_resp = await call_with_retry(
                    lambda: client.aio.models.generate_content(
                        model=model_name,
                        contents=[audio, "Transcribe the spoken words in this audio accurately, including speaker labels if distinguishable."],
                    )
                )
                if transcribe_resp and transcribe_resp.text and transcribe_resp.text.strip():
                    raw_text = transcribe_resp.text.strip()
                    break
            except Exception as e:
                logger.warning(f"Raw transcription failed with model {model_name}: {e}")

        # Pass 2: structure into diarized JSON segments with the capable model
        last_error: Optional[Exception] = None
        for model_name in structure_models:
            try:
                logger.info(f"Structuring diarized transcript with model: {model_name}")
                prompt = structure_prompt
                if raw_text:
                    prompt += (
                        f"\n\n=== RAW AUDIO TRANSCRIPTION (ground truth for wording) ===\n"
                        f"{raw_text}\n"
                        f"=== END RAW TRANSCRIPTION ==="
                    )
                config = types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=FinalTranscriptData,
                    temperature=0.1
                )
                response = await call_with_retry(
                    lambda: client.aio.models.generate_content(
                        model=model_name,
                        contents=[audio, prompt],
                        config=config,
                    )
                )
                if response and response.text:
                    parsed_data = json.loads(response.text)
                    return FinalTranscriptData(**parsed_data)
            except Exception as e:
                last_error = e
                logger.warning(f"Final transcription failed with model {model_name}: {e}")

        if not self._api_key and settings.mock_mode_if_no_key:
            logger.info("Using segmented live transcript fallback for diarization.")
            return self.segment_live_transcript(language_mode, live_transcript_text)

        # Key is present: never fabricate a transcript — fail loudly.
        raise RuntimeError(
            f"Failed to generate final transcript with configured Gemini models: {last_error}"
        )

    def segment_live_transcript(
        self,
        language_mode: str,
        live_transcript_text: Optional[str] = None,
    ) -> FinalTranscriptData:
        """Segments the verified live transcript into diarized segments.

        Used when no API key is configured (mock mode) AND as a graceful
        degradation when final transcription fails but live speech was
        captured — the words are the user's own, nothing is invented.
        """
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
