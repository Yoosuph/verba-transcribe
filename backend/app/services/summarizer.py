import json
import logging
import re
from typing import Optional, List
from google import genai
from google.genai import types
from app.config import settings
from app.models.transcription import (
    FinalTranscriptData,
    MeetingSummary,
    DecisionItem,
    ActionItem,
    SpeakerContribution,
)
from app.services.gemini_transcribe import MAX_GUIDANCE_CHARS
from app.services.gemini_retry import call_with_retry
from app.services import openrouter_fallback

logger = logging.getLogger(__name__)

SUMMARIZER_SYSTEM_PROMPT = """You are an expert meeting analyst producing a rigorous, transcript-grounded meeting record.

Use ONLY information explicitly contained in the supplied transcript. Never invent facts, names, numbers, intentions, or outcomes. If something is uncertain or ambiguous, mark it as uncertain or omit it. Preserve important Hausa expressions, proverbs and personal names accurately (do not translate names).

Output MUST be a single JSON object matching the schema exactly:

1. executive_summary: 3–6 sentences covering (a) the meeting's purpose, (b) the main topics discussed, and (c) the outcomes/next steps. Neutral, factual tone. Write in the dominant language of the transcript (English or Hausa).

2. key_points: 5–10 DISTINCT substantive takeaways. Each point must be a SHORT standalone sentence (max ~25 words) that SYNTHESIZES the discussion — never copy a raw transcript line verbatim, never repeat the executive summary.

3. decisions: ONLY outcomes the participants explicitly agreed to or resolved. Each item:
   - decision: one concise sentence stating WHAT was decided (rewrite; do not paste the whole utterance).
   - evidence_segment_ids: the exact [seg_X] ids that support it.
   If nobody explicitly decided anything, return an empty list — do NOT promote mere discussion into decisions.

4. action_items: ONLY concrete commitments to do something. Each item:
   - task: the specific todo, phrased as an imperative (e.g. "Prepare the Q3 budget draft").
   - assignee: the speaker explicitly tasked, or null if nobody was named.
   - deadline: only if a date/deadline was stated, else null.
   - evidence_segment_ids: supporting [seg_X] ids.
   - completed: false.
   Questions, suggestions, or hypotheticals are NOT action items. If none, return an empty list.

5. questions: open/unresolved questions the group raised or left hanging.

6. speaker_contributions: one short paragraph (1–2 sentences) per speaker capturing their role and main positions.

Evidence rule: EVERY decision and action item MUST include evidence_segment_ids referencing the [seg_X] tags from the input. Only use ids that appear in the transcript. Never fabricate ids."""

class MeetingSummarizer:
    """Generates strictly transcript-grounded meeting summaries with evidence links."""

    @property
    def _api_key(self) -> str:
        return settings.gemini_api_key

    async def summarize_transcript(
        self,
        transcript_data: FinalTranscriptData,
        audio_wav_bytes: Optional[bytes] = None,
        live_transcript_text: Optional[str] = None,
        audio_part: Optional[types.Part] = None,
        agenda: Optional[str] = None,
    ) -> MeetingSummary:
        """
        Grounds the summary in the finalized transcript. When available, the
        already-uploaded audio part is included so ambiguous passages can be
        cross-checked against the recording (single upload, reused).
        When an agenda is provided it structures the summary WITHOUT inventing
        content that is absent from the transcript.
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
        if live_transcript_text and live_transcript_text.strip():
            guidance = live_transcript_text.strip()[:MAX_GUIDANCE_CHARS]
            user_content += (
                f"\n\n=== VERIFIED REAL-TIME LIVE TRANSCRIPT (cross-check) ===\n"
                f"{guidance}\n"
                f"=== END LIVE TRANSCRIPT ==="
            )
        if agenda and agenda.strip():
            user_content += (
                f"\n\n=== MEETING AGENDA (structure the summary against these items "
                f"ONLY where the transcript covers them; never invent coverage) ===\n"
                f"{agenda.strip()[:4000]}\n"
                f"=== END AGENDA ==="
            )

        client = genai.Client(api_key=self._api_key)
        models_to_try = [settings.gemini_summary_model] + settings.gemini_summary_fallback_models

        audio_part_obj = audio_part
        if audio_part_obj is None and audio_wav_bytes:
            audio_part_obj = types.Part.from_bytes(data=audio_wav_bytes, mime_type="audio/wav")

        last_error: Optional[Exception] = None
        for model_name in models_to_try:
            try:
                logger.info(f"Generating summary with model: {model_name}")
                config = types.GenerateContentConfig(
                    system_instruction=SUMMARIZER_SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_schema=MeetingSummary,
                    temperature=0.1
                )

                # Ground the summary in BOTH the transcript and the full recording:
                # audio resolves ambiguous or mistranscribed passages.
                contents = (
                    [audio_part_obj, user_content]
                    if audio_part_obj else user_content
                )

                response = await call_with_retry(
                    lambda: client.aio.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=config,
                    )
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
                last_error = e
                logger.warning(f"Summary generation failed with model {model_name}: {e}")

        # Non-Gemini fallback (OpenRouter): used when every Gemini model is
        # quota-exhausted or otherwise unavailable. Skipped when no key is set.
        if openrouter_fallback.is_configured():
            try:
                logger.warning(
                    "Gemini chain failed (%s); trying OpenRouter fallback", last_error
                )
                raw = await openrouter_fallback.chat_completion(
                    system=SUMMARIZER_SYSTEM_PROMPT,
                    user=user_content,
                    temperature=0.1,
                    max_tokens=2500,
                )
                parsed_json = openrouter_fallback.extract_json(raw)
                summary = MeetingSummary(**parsed_json)
                for idx, d in enumerate(summary.decisions):
                    if not d.id:
                        d.id = f"dec_{idx + 1}"
                for idx, a in enumerate(summary.action_items):
                    if not a.id:
                        a.id = f"act_{idx + 1}"
                return summary
            except Exception as or_err:
                last_error = or_err
                logger.warning("OpenRouter fallback failed: %s", or_err)

        # API key is present: never silently substitute a fabricated summary.
        raise RuntimeError(f"Summary generation failed with all configured models: {last_error}")

    def grounded_fallback_summary(self, transcript_data: FinalTranscriptData) -> MeetingSummary:
        """Transcript-grounded summary built only from real transcript text.

        Used when every model call fails (e.g. sustained 503s) so the meeting
        still completes with a usable, evidence-linked summary instead of
        erroring out. Content is extracted verbatim from the transcript.
        """
        logger.warning("Using transcript-grounded fallback summary (model calls failed).")
        return self._generate_simulated_summary(transcript_data)

    def _generate_simulated_summary(self, transcript_data: FinalTranscriptData) -> MeetingSummary:
        """Transcript-grounded heuristic extraction — only used when NO model
        call succeeded. Deliberately conservative: empty lists beat wrong ones.
        Weak patterns (e.g. bare Hausa "zan") are avoided so discussion is not
        misreported as decisions or commitments.
        """
        if not transcript_data or not transcript_data.segments:
            return MeetingSummary(
                executive_summary="No spoken dialogue was detected in this recording.",
                key_points=[],
                decisions=[],
                action_items=[],
                questions=[],
                speaker_contributions=[]
            )

        sentences = [seg.text.strip() for seg in transcript_data.segments if seg.text.strip()]
        full_text = " ".join(sentences)

        # Executive summary: opening substantive content (skip bare greetings)
        fillers = re.compile(
            r"^(hello|hi|hey|sannu|sannu da aiki|good (morning|afternoon|evening)|"
            r"thanks|thank you|na gode|okay|ok|yes|yeah|alhamdulillah)[.!, ]*$",
            re.IGNORECASE,
        )
        substantive = [s for s in sentences if not fillers.match(s)]
        if not substantive:
            substantive = sentences
        joined = " ".join(substantive)
        if len(joined) > 400:
            exec_summary = joined[:380].rsplit(".", 1)[0] + "…"
        else:
            exec_summary = joined

        # Key points: the most informative-length sentences, de-duplicated,
        # skipping greetings — never more than 6.
        seen: set = set()
        key_points: List[str] = []
        for s in substantive:
            if len(s) < 25 or fillers.match(s):
                continue
            norm = s.lower().rstrip(".!?")
            if norm in seen:
                continue
            seen.add(norm)
            key_points.append(s if len(s) <= 160 else s[:157] + "…")
            if len(key_points) >= 6:
                break

        # Strong, explicit signals only (EN + HA). Discussion verbs alone
        # ("think", "maybe", "zan iya") do NOT qualify.
        decision_pattern = re.compile(
            r"\b(decided|decision|agreed|agreement|approved|approved|resolved|resolution|"
            r"finalized|confirmed|mun amince|anka amince|hukunci|shawara ta amince)\b",
            re.IGNORECASE,
        )
        action_pattern = re.compile(
            r"\b(action item|responsible for|will (handle|send|prepare|submit|complete|review|draft|follow)|"
            r"must (submit|complete|prepare|send)|need to (submit|complete|prepare|send)|"
            r"deadline is|due (by|on)|assigned to)\b",
            re.IGNORECASE,
        )
        decisions = []
        action_items = []
        for seg in transcript_data.segments:
            lower = seg.text.lower()
            if decision_pattern.search(lower) and len(seg.text) <= 300:
                decisions.append(
                    DecisionItem(
                        id=f"dec_{len(decisions) + 1}",
                        decision=seg.text.strip(),
                        evidence_segment_ids=[seg.id],
                    )
                )
            if action_pattern.search(lower) and len(seg.text) <= 300:
                action_items.append(
                    ActionItem(
                        id=f"act_{len(action_items) + 1}",
                        task=seg.text.strip(),
                        assignee=seg.speaker,
                        evidence_segment_ids=[seg.id],
                        completed=False,
                    )
                )

        speaker_map = {}
        for seg in transcript_data.segments:
            speaker_map.setdefault(seg.speaker, []).append(seg.text.strip())

        speaker_contributions = [
            SpeakerContribution(
                speaker=spk,
                summary=" ".join(texts)[:160] + "..." if len(" ".join(texts)) > 160 else " ".join(texts)
            )
            for spk, texts in speaker_map.items()
        ]

        return MeetingSummary(
            executive_summary=exec_summary or full_text[:380],
            key_points=key_points,
            decisions=decisions,
            action_items=action_items,
            questions=[],
            speaker_contributions=speaker_contributions
        )


meeting_summarizer = MeetingSummarizer()
