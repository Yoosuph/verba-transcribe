export type LanguageMode = 'auto' | 'en' | 'ha';

export type SessionStatus = 'idle' | 'connecting' | 'recording' | 'processing' | 'complete' | 'error';

export type ProcessingStage = 'final_transcription' | 'speaker_diarization' | 'summarization' | null;

export interface LiveTranscriptItem {
  id: string;
  text: string;
  is_final: boolean;
  timestamp_ms: number;
  speaker_label?: string;
}

export interface TranscriptSegment {
  id: string;
  speaker: string;
  start: number;
  end: number;
  text: string;
  language?: string;
}

export interface FinalTranscriptData {
  language: string;
  segments: TranscriptSegment[];
}

export interface DecisionItem {
  id: string;
  decision: string;
  evidence_segment_ids: string[];
}

export interface ActionItem {
  id: string;
  task: string;
  assignee?: string;
  deadline?: string;
  evidence_segment_ids: string[];
  completed: boolean;
}

export interface SpeakerContribution {
  speaker: string;
  summary: string;
}

export interface MeetingSummary {
  executive_summary: string;
  key_points: string[];
  decisions: DecisionItem[];
  action_items: ActionItem[];
  questions: string[];
  speaker_contributions: SpeakerContribution[];
}

export interface CaseInformation {
  case_number: string;
  court: string;
  division?: string;
  judge: string;
  coram?: string[];
  hearing_date: string;
  hearing_type: string;
  duration?: string;
  hearing_no?: string;
}

export interface HearingParties {
  claimant: string;
  counsel_claimant: string;
  defendant: string;
  counsel_defendant: string;
  witnesses: string[];
}

export interface ProceedingNarrativeItem {
  stage: string;
  timestamp?: string;
  speaker: string;
  text: string;
}

export interface LegalIssue {
  issue: string;
  source_time?: string;
}

export interface PartySubmissions {
  claimant: string[];
  defendant: string[];
}

export interface WitnessEvidence {
  witness: string;
  summary: string;
  key_statements: string[];
  cross_examination?: string;
  timestamp?: string;
}

export interface ExhibitItem {
  number: string;
  description: string;
  party: string;
  timestamp?: string;
}

export interface CourtOrder {
  order: string;
  source_time?: string;
}

export interface AdjournmentInfo {
  date: string;
  time: string;
  purpose: string;
}

export interface JudicialHearingReport {
  case: CaseInformation;
  parties: HearingParties;
  bismillah_header?: string;
  summary: string;
  proceedings: ProceedingNarrativeItem[];
  issues: LegalIssue[];
  submissions: PartySubmissions;
  witness_evidence: WitnessEvidence[];
  exhibits: ExhibitItem[];
  islamic_authorities?: string[];
  court_observations: string[];
  orders: CourtOrder[];
  action_items: ActionItem[];
  next_hearing: AdjournmentInfo;
  appendix_transcript?: FinalTranscriptData;
}

export interface SessionData {
  id: string;
  title?: string;
  status: SessionStatus;
  processing_stage?: ProcessingStage;
  started_at?: string;
  ended_at?: string;
  duration_seconds: number;
  language_mode: LanguageMode;
  detected_language?: string;
  live_transcript: LiveTranscriptItem[];
  final_transcript?: FinalTranscriptData;
  summary?: MeetingSummary;
  case_info?: CaseInformation;
  parties?: HearingParties;
  hearing_report?: JudicialHearingReport;
  report_status?: 'not_generated' | 'generating' | 'ready' | 'error';
  speaker_names: Record<string, string>;
  has_audio?: boolean;
  audio_url?: string;
  error_message?: string;
}

export type SessionState = SessionData;


// WebSocket message schemas
export type InboundWSMessage =
  | { type: 'connected'; session_id: string }
  | { type: 'transcript.interim'; text: string; session_id: string }
  | { type: 'transcript.final'; text: string; session_id: string }
  | { type: 'processing'; stage: ProcessingStage }
  | { type: 'final_transcript'; session_id: string; data: FinalTranscriptData }
  | { type: 'summary'; session_id: string; data: MeetingSummary }
  | { type: 'complete'; session_id: string }
  | { type: 'session_limit'; session_id: string; code: string; message: string }
  | { type: 'ping' }
  | { type: 'pong' }
  | { type: 'error'; code: string; message: string };

export type OutboundWSMessage =
  | { type: 'start'; session_id: string; language_mode: LanguageMode }
  | { type: 'stop' }
  | { type: 'ping' }
  | { type: 'rename_speaker'; old_name: string; new_name: string };
