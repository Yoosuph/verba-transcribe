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

class Bookmark(BaseModel):
    id: str = Field(default="", description="Unique bookmark ID")
    segment_id: Optional[str] = Field(default=None, description="Transcript segment this bookmark points at")
    time_seconds: float = Field(default=0.0, description="Audio timestamp in seconds")
    note: str = Field(default="", description="User note for the bookmark")
    created_at: str = Field(default="", description="ISO timestamp")

class QAEntry(BaseModel):
    question: str
    answer: str
    evidence_segment_ids: List[str] = Field(default_factory=list)
    created_at: str = ""

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
    translated_transcript: Optional[FinalTranscriptData] = None
    summary: Optional[MeetingSummary] = None
    speaker_names: Dict[str, str] = Field(default_factory=dict)
    has_audio: bool = False
    audio_url: Optional[str] = None
    error_message: Optional[str] = None
    # Feature: highlights/bookmarks
    bookmarks: List[Bookmark] = Field(default_factory=list)
    # Feature: Ask chat history (grounded Q&A)
    qa_history: List[QAEntry] = Field(default_factory=list)
    # Feature: folders/tags
    tags: List[str] = Field(default_factory=list)
    # Feature: meeting templates/agenda (shapes summarization)
    agenda: Optional[str] = None
    template: Optional[str] = None
    # Feature: read-only share links
    share_token: Optional[str] = None
    share_expires_at: Optional[str] = None

class RenameSpeakerRequest(BaseModel):
    old_name: str
    new_name: str

class UpdateActionItemRequest(BaseModel):
    completed: bool

class UpdateSessionRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200, description="New meeting title")
    tags: Optional[List[str]] = Field(default=None, max_length=20, description="Replacement tag list")
    agenda: Optional[str] = Field(default=None, max_length=4000, description="Meeting agenda shown to the summarizer")
    template: Optional[str] = Field(default=None, max_length=64, description="Template name used for this meeting")

class EditSegmentRequest(BaseModel):
    text: Optional[str] = Field(default=None, max_length=4000)
    speaker: Optional[str] = Field(default=None, max_length=120)

class CreateBookmarkRequest(BaseModel):
    segment_id: Optional[str] = None
    time_seconds: float = 0.0
    note: str = Field(default="", max_length=500)

class ShareLinkRequest(BaseModel):
    ttl_hours: int = Field(default=168, ge=1, le=24 * 90, description="Link lifetime in hours")

class AskRequest(BaseModel):
    question: str

class AskResponse(BaseModel):
    answer: str
    evidence_segment_ids: List[str] = Field(default_factory=list)

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)

class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=6, max_length=256)
    role: Literal["viewer", "editor", "admin"] = "editor"

class UserOut(BaseModel):
    username: str
    role: Literal["viewer", "editor", "admin"]


