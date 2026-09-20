import json
import logging
from typing import Optional
from google import genai
from google.genai import types
from app.config import settings
from app.models.transcription import (
    FinalTranscriptData,
    MeetingSummary,
    DecisionItem,
    ActionItem,
    SpeakerContribution
)

logger = logging.getLogger(__name__)

SUMMARIZER_SYSTEM_PROMPT = """You are a factual meeting summarization system.

Use ONLY information explicitly contained in the supplied transcript.

Do not invent facts.
Do not infer unstated intentions.
Do not fabricate decisions.
Do not assign action items unless the transcript indicates that someone agreed to perform the action.
If information is uncertain or ambiguous, explicitly mark it as uncertain.

Preserve important Hausa expressions and names accurately.

Return structured JSON according to the schema.
Ensure EVERY decision and action item includes the exact 'evidence_segment_ids' corresponding to the segment IDs (e.g. 'seg_1', 'seg_4') from the input transcript that support it.
"""

class MeetingSummarizer:
    """Generates strictly transcript-grounded meeting summaries with evidence links."""

    def __init__(self):
        self._api_key = settings.gemini_api_key

    async def summarize_transcript(self, transcript_data: FinalTranscriptData) -> MeetingSummary:
        """
        Sends ONLY the finalized transcript to Gemini to produce a grounded summary.
        """
        if not self._api_key:
            if settings.mock_mode_if_no_key:
                logger.info("No GEMINI_API_KEY. Using simulated grounded summary.")
                return self._generate_simulated_summary(transcript_data)
            else:
                raise ValueError("GEMINI_API_KEY is not configured in backend/.env")

        # Format the transcript into clear, structured text with explicit segment IDs
        transcript_text_lines = []
        for seg in transcript_data.segments:
            line = f"[{seg.id}] ({seg.start:.1f}s - {seg.end:.1f}s) {seg.speaker}: {seg.text}"
            transcript_text_lines.append(line)
        formatted_transcript = "\n".join(transcript_text_lines)

        user_content = (
            f"Here is the finalized meeting transcript:\n\n"
            f"Overall language detected: {transcript_data.language}\n\n"
            f"{formatted_transcript}\n\n"
            f"Generate a strictly grounded summary with evidence segment IDs referencing the [seg_X] tags above."
        )

        client = genai.Client(api_key=self._api_key)
        models_to_try = [settings.gemini_summary_model, "gemini-3.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"]

        for model_name in models_to_try:
            try:
                logger.info(f"Generating summary with model: {model_name}")
                config = types.GenerateContentConfig(
                    system_instruction=SUMMARIZER_SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_schema=MeetingSummary,
                    temperature=0.1
                )

                response = await client.aio.models.generate_content(
                    model=model_name,
                    contents=user_content,
                    config=config
                )

                if response and response.text:
                    parsed_json = json.loads(response.text)
                    summary = MeetingSummary(**parsed_json)
                    # Ensure IDs are populated for decisions and action items
                    for idx, d in enumerate(summary.decisions):
                        if not d.id:
                            d.id = f"dec_{idx + 1}"
                    for idx, a in enumerate(summary.action_items):
                        if not a.id:
                            a.id = f"act_{idx + 1}"
                    return summary
            except Exception as e:
                logger.warning(f"Summary generation failed with model {model_name}: {e}")

        logger.info("Falling back to transcript-grounded summary extraction.")
        return self._generate_simulated_summary(transcript_data)

    def _generate_simulated_summary(self, transcript_data: FinalTranscriptData) -> MeetingSummary:
        """Transcript-grounded fallback extraction strictly from the user's spoken words."""
        if not transcript_data or not transcript_data.segments:
            return MeetingSummary(
                executive_summary="No spoken dialogue was detected in this recording.",
                key_points=[],
                decisions=[],
                action_items=[],
                questions=[],
                speaker_contributions=[]
            )

        # Build executive summary strictly from the user's actual spoken segments
        sentences = [seg.text.strip() for seg in transcript_data.segments if seg.text.strip()]
        full_text = " ".join(sentences)
        if len(full_text) > 300:
            exec_summary = full_text[:280].rsplit(".", 1)[0] + "."
        else:
            exec_summary = full_text

        key_points = [s for s in sentences[:4] if len(s) > 10]

        decisions = []
        action_items = []
        for idx, seg in enumerate(transcript_data.segments):
            lower = seg.text.lower()
            if any(w in lower for w in ["decide", "agreed", "resolved", "approved", "mun amince", "hukunci", "zamu"]):
                decisions.append(
                    DecisionItem(
                        id=f"dec_{len(decisions) + 1}",
                        decision=seg.text.strip(),
                        evidence_segment_ids=[seg.id]
                    )
                )
            if any(w in lower for w in ["will", "must", "should", "need to", "action", "task", "zan", "zaki", "zaka", "aikin"]):
                action_items.append(
                    ActionItem(
                        id=f"act_{len(action_items) + 1}",
                        task=seg.text.strip(),
                        assignee=seg.speaker,
                        evidence_segment_ids=[seg.id],
                        completed=False
                    )
                )

        speaker_map = {}
        for seg in transcript_data.segments:
            if seg.speaker not in speaker_map:
                speaker_map[seg.speaker] = []
            speaker_map[seg.speaker].append(seg.text.strip())

        speaker_contributions = [
            SpeakerContribution(
                speaker=spk,
                summary=" ".join(texts)[:160] + "..." if len(" ".join(texts)) > 160 else " ".join(texts)
            )
            for spk, texts in speaker_map.items()
        ]

        return MeetingSummary(
            executive_summary=exec_summary,
            key_points=key_points or [exec_summary],
            decisions=decisions,
            action_items=action_items,
            questions=[],
            speaker_contributions=speaker_contributions
        )

meeting_summarizer = MeetingSummarizer()
