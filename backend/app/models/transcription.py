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

class CaseInformation(BaseModel):
    case_number: str = Field(default="FHC/KN/CS/1042/2026", description="Court suit or case number")
    court: str = Field(default="Federal High Court, Kano", description="Court division and name")
    judge: str = Field(default="Hon. Justice M. S. Abubakar", description="Presiding judge")
    hearing_date: str = Field(default="21 September 2026", description="Date of hearing")
    hearing_type: str = Field(default="Motion Hearing", description="Type of hearing, e.g. Motion Hearing, Trial, Ruling")
    duration: str = Field(default="00:00:00", description="Duration of hearing session")
    hearing_no: str = Field(default="4", description="Hearing number in series")

class HearingParties(BaseModel):
    claimant: str = Field(default="ABC Limited", description="Claimant / Applicant")
    counsel_claimant: str = Field(default="Barr. Ibrahim Gambo", description="Counsel representing Claimant")
    defendant: str = Field(default="XYZ Limited", description="Defendant / Respondent")
    counsel_defendant: str = Field(default="Barr. Aisha Bello", description="Counsel representing Defendant")
    witnesses: List[str] = Field(default_factory=lambda: ["PW1 — Aliyu Mohammed", "DW1 — Zainab Garba"], description="Witnesses called")

class ProceedingNarrativeItem(BaseModel):
    stage: str = Field(..., description="Stage title, e.g. Opening, Submissions by Claimant, Ruling")
    timestamp: str = Field(..., description="Timestamp in proceedings, e.g. 09:42:17")
    speaker: str = Field(..., description="Speaker identifier, e.g. COURT, CLAIMANT'S COUNSEL")
    text: str = Field(..., description="Narrative description of what transpired")

class LegalIssue(BaseModel):
    issue: str = Field(..., description="Major legal or factual issue considered")
    source_time: Optional[str] = Field(default=None, description="Transcript timestamp reference, e.g. 00:47:21")

class PartySubmissions(BaseModel):
    claimant: List[str] = Field(default_factory=list, description="Submissions by Claimant / Applicant counsel")
    defendant: List[str] = Field(default_factory=list, description="Submissions by Defendant / Respondent counsel")

class WitnessEvidence(BaseModel):
    witness: str = Field(..., description="Witness designation e.g. PW1, DW1")
    summary: str = Field(..., description="Summary of witness evidence")
    key_statements: List[str] = Field(default_factory=list, description="Key bullet statements")
    cross_examination: Optional[str] = Field(default=None, description="Cross-examination summary if any")
    timestamp: Optional[str] = Field(default=None, description="Evidence timestamp in recording")

class ExhibitItem(BaseModel):
    number: str = Field(..., description="Exhibit number e.g. P1, P2, D1")
    description: str = Field(..., description="Description of document or object tendered")
    party: str = Field(default="Claimant", description="Tendering party (Claimant / Defendant)")
    timestamp: Optional[str] = Field(default=None, description="Time referenced in proceeding")

class CourtOrder(BaseModel):
    order: str = Field(..., description="Court order or formal direction issued")
    source_time: Optional[str] = Field(default=None, description="Transcript reference time e.g. 01:43:21")

class AdjournmentInfo(BaseModel):
    date: str = Field(default="12 October 2026", description="Adjourned hearing date")
    time: str = Field(default="09:00 AM", description="Hearing time")
    purpose: str = Field(default="Further hearing of the application.", description="Hearing purpose")

class JudicialHearingReport(BaseModel):
    case: CaseInformation = Field(default_factory=CaseInformation)
    parties: HearingParties = Field(default_factory=HearingParties)
    summary: str = Field(..., description="Executive summary of the hearing (3-6 paragraphs)")
    proceedings: List[ProceedingNarrativeItem] = Field(default_factory=list, description="Chronological narrative of proceedings")
    issues: List[LegalIssue] = Field(default_factory=list, description="Key issues considered with timestamp citations")
    submissions: PartySubmissions = Field(default_factory=PartySubmissions, description="Arguments separated by claimant and defendant")
    witness_evidence: List[WitnessEvidence] = Field(default_factory=list, description="Witness testimony and cross-examination summaries")
    exhibits: List[ExhibitItem] = Field(default_factory=list, description="Exhibits tendered or referenced")
    court_observations: List[str] = Field(default_factory=list, description="Factual matters noted during proceedings")
    orders: List[CourtOrder] = Field(default_factory=list, description="Formal court orders and directions with timestamp citations")
    action_items: List[ActionItem] = Field(default_factory=list, description="Administrative tasks and compliance deadlines")
    next_hearing: AdjournmentInfo = Field(default_factory=AdjournmentInfo, description="Adjournment and next hearing details")
    appendix_transcript: Optional[FinalTranscriptData] = Field(default=None, description="Complete verbatim speaker-labelled transcript")

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
    case_info: Optional[CaseInformation] = None
    parties: Optional[HearingParties] = None
    hearing_report: Optional[JudicialHearingReport] = None
    speaker_names: Dict[str, str] = Field(default_factory=dict)
    has_audio: bool = False
    audio_url: Optional[str] = None
    error_message: Optional[str] = None

class RenameSpeakerRequest(BaseModel):
    old_name: str
    new_name: str

class UpdateActionItemRequest(BaseModel):
    completed: bool

class UpdateCaseInfoRequest(BaseModel):
    case: Optional[CaseInformation] = None
    parties: Optional[HearingParties] = None

class AskRequest(BaseModel):
    question: str

class AskResponse(BaseModel):
    answer: str
    evidence_segment_ids: List[str] = Field(default_factory=list)


