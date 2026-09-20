from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, Field

class TranscriptSegment(BaseModel):
    id: str = Field(..., description="Unique identifier for the segment, e.g. seg_1")
    speaker: str = Field(..., description="Speaker label, e.g. Speaker 1")
    start: float = Field(..., description="Start timestamp in seconds")
    end: float = Field(..., description="End timestamp in seconds")
    text: str = Field(..., description="Transcribed text for this segment")
    language: Optional[str] = Field(default=None, description="Language detected or used for this segment, e.g. ha-NG or en-US")

class FinalTranscriptData(BaseModel):
    language: str = Field(default="auto", description="Primary or overall language detected")
    segments: List[TranscriptSegment] = Field(default_factory=list)

class DecisionItem(BaseModel):
    id: str = Field(default="", description="Unique decision ID")
    decision: str = Field(..., description="Factual decision made in the meeting")
    evidence_segment_ids: List[str] = Field(default_factory=list, description="IDs of segments evidencing this decision")

class ActionItem(BaseModel):
    id: str = Field(default="", description="Unique action item ID")
    task: str = Field(..., description="Task to be performed")
    assignee: Optional[str] = Field(default=None, description="Speaker assigned to the task if stated")
    deadline: Optional[str] = Field(default=None, description="Agreed deadline if stated")
    evidence_segment_ids: List[str] = Field(default_factory=list, description="IDs of segments evidencing this action item")
    completed: bool = Field(default=False, description="Whether the action item is checked off")

class SpeakerContribution(BaseModel):
    speaker: str = Field(..., description="Speaker name")
    summary: str = Field(..., description="Summary of speaker's core contributions")

class MeetingSummary(BaseModel):
    executive_summary: str = Field(..., description="Comprehensive factual executive summary grounded in transcript")
    key_points: List[str] = Field(default_factory=list, description="List of key points")
    decisions: List[DecisionItem] = Field(default_factory=list, description="Agreed decisions with evidence links")
    action_items: List[ActionItem] = Field(default_factory=list, description="Agreed action items with assignees and evidence")
    questions: List[str] = Field(default_factory=list, description="Unresolved questions or discussions raised")
    speaker_contributions: List[SpeakerContribution] = Field(default_factory=list, description="Summary of each speaker's contributions")

class LiveTranscriptItem(BaseModel):
    id: str
    text: str
    is_final: bool = False
    timestamp_ms: int = 0
    speaker_label: Optional[str] = None

class SessionState(BaseModel):
    id: str
    title: Optional[str] = "New Recording"
    status: Literal["idle", "recording", "processing", "complete", "error"] = "idle"
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    duration_seconds: float = 0.0
    language_mode: str = "auto"
    detected_language: Optional[str] = None
    live_transcript: List[LiveTranscriptItem] = Field(default_factory=list)
    final_transcript: Optional[FinalTranscriptData] = None
    summary: Optional[MeetingSummary] = None
    speaker_names: Dict[str, str] = Field(default_factory=dict)
    has_audio: bool = False
    audio_url: Optional[str] = None
    error_message: Optional[str] = None

class RenameSpeakerRequest(BaseModel):
    old_name: str
    new_name: str

class UpdateActionItemRequest(BaseModel):
    completed: bool

class AskRequest(BaseModel):
    question: str

class AskResponse(BaseModel):
    answer: str
    evidence_segment_ids: List[str] = Field(default_factory=list)

