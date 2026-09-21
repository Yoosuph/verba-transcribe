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
    case_number: str = Field(default="JGS/SCA/DTS/CV/018/2026", description="Court appeal or suit number")
    court: str = Field(default="Sharia Court of Appeal, Jigawa State", description="Court division and name")
    division: str = Field(default="Dutse Judicial Division", description="Judicial division")
    judge: str = Field(default="Hon. Kadi Sani Salihu (Hon. Grand Kadi)", description="Presiding Grand Kadi / Judge")
    coram: List[str] = Field(
        default_factory=lambda: [
            "Hon. Kadi Sani Salihu (Hon. Grand Kadi / Presiding)",
            "Hon. Kadi Abubakar M. Gumel (Hon. Kadi)",
            "Hon. Kadi Usman Birnin Kudu (Hon. Kadi)"
        ],
        description="Panel of Kadis"
    )
    hearing_date: str = Field(default="21 September 2026", description="Date of hearing")
    hearing_type: str = Field(default="Civil Appeal (Islamic Personal Law / Mirath)", description="Type of hearing, e.g. Civil Appeal, Inheritance, Matrimonial, Trial")
    duration: str = Field(default="00:00:00", description="Duration of hearing session")
    hearing_no: str = Field(default="2", description="Hearing number in series")

class HearingParties(BaseModel):
    claimant: str = Field(default="Alhaji Haruna Garba & Ors (Mai Daukaka Kara / Appellant)", description="Appellant / Claimant / Mai Kara")
    counsel_claimant: str = Field(default="Barr. Ibrahim Gambo Dutse", description="Counsel or Wakil for Appellant")
    defendant: str = Field(default="Malam Mustapha Suleiman (Wanda Ake Daukaka Kara / Respondent)", description="Respondent / Defendant / Wanda Ake Kara")
    counsel_defendant: str = Field(default="Barr. Aisha Mohammed Hadejia", description="Counsel or Wakil for Respondent")
    witnesses: List[str] = Field(default_factory=list, description="Witnesses called")

class ProceedingNarrativeItem(BaseModel):
    stage: str = Field(..., description="Stage title, e.g. Call of Appeal, Submissions by Appellant, Inquiries by the Bench, Orders")
    speaker: str = Field(..., description="Speaker or participant, e.g. THE BENCH / GRAND KADI, COUNSEL FOR APPELLANT")
    text: str = Field(..., description="Narrative procedural explanation of what transpired")
    timestamp: Optional[str] = Field(default=None, description="Optional timestamp reference")

class LegalIssue(BaseModel):
    issue: str = Field(..., description="Major legal or Sharia issue considered")
    source_time: Optional[str] = Field(default=None, description="Optional transcript reference")

class PartySubmissions(BaseModel):
    claimant: List[str] = Field(default_factory=list, description="Submissions on behalf of Appellant / Claimant")
    defendant: List[str] = Field(default_factory=list, description="Submissions on behalf of Respondent / Defendant")

class WitnessEvidence(BaseModel):
    witness: str = Field(..., description="Witness designation e.g. PW1, DW1, Shaidar Bayyina")
    summary: str = Field(..., description="Summary of witness evidence and sworn testimony")
    key_statements: List[str] = Field(default_factory=list, description="Key bullet statements")
    cross_examination: Optional[str] = Field(default=None, description="Cross-examination summary if any")
    timestamp: Optional[str] = Field(default=None, description="Optional timestamp")

class ExhibitItem(BaseModel):
    number: str = Field(..., description="Exhibit designation e.g. Exhibit P1, D1, Takarda A")
    description: str = Field(..., description="Description of document, record of proceedings, or object tendered")
    party: str = Field(default="Appellant", description="Tendering party (Appellant / Respondent)")
    timestamp: Optional[str] = Field(default=None, description="Optional timestamp")

class CourtOrder(BaseModel):
    order: str = Field(..., description="Formal judicial order, ruling, or directive issued (Hukunci)")
    source_time: Optional[str] = Field(default=None, description="Optional reference")

class AdjournmentInfo(BaseModel):
    date: str = Field(default="12 October 2026", description="Adjourned hearing date")
    time: str = Field(default="09:00 AM", description="Hearing time")
    purpose: str = Field(default="Continuation of hearing and adoption of addresses.", description="Hearing purpose")

class JudicialHearingReport(BaseModel):
    case: CaseInformation = Field(default_factory=CaseInformation)
    parties: HearingParties = Field(default_factory=HearingParties)
    bismillah_header: str = Field(
        default="بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ — IN THE NAME OF ALLAH, THE MOST BENEFICENT, THE MOST MERCIFUL",
        description="Bismillah header invocation"
    )
    summary: str = Field(..., description="Executive summary of the hearing proceedings (3-6 paragraphs)")
    proceedings: List[ProceedingNarrativeItem] = Field(default_factory=list, description="Chronological explanation of proceedings stages")
    issues: List[LegalIssue] = Field(default_factory=list, description="Key legal and Sharia issues considered")
    submissions: PartySubmissions = Field(default_factory=PartySubmissions, description="Submissions of Appellant and Respondent")
    witness_evidence: List[WitnessEvidence] = Field(default_factory=list, description="Witness testimony and cross-examination summaries")
    exhibits: List[ExhibitItem] = Field(default_factory=list, description="Exhibits and documentary records tendered")
    islamic_authorities: List[str] = Field(default_factory=list, description="Islamic jurisprudence authorities and Fiqh citations")
    court_observations: List[str] = Field(default_factory=list, description="Factual and legal matters observed by the Bench")
    orders: List[CourtOrder] = Field(default_factory=list, description="Formal court orders and rulings pronounced (Hukunci)")
    action_items: List[ActionItem] = Field(default_factory=list, description="Administrative directives and registry compliance deadlines")
    next_hearing: AdjournmentInfo = Field(default_factory=AdjournmentInfo, description="Adjournment details (Ta'jil)")
    appendix_transcript: Optional[FinalTranscriptData] = Field(default=None, description="Verbatim speaker-labelled transcript")

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


