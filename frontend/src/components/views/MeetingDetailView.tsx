import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  Share2,
  Check,
  Copy,
  Play,
  Pause,
  FileCheck,
  Scale,
  Gavel,
  Calendar,
  Clock,
  Volume2,
  FileDown,
} from 'lucide-react';
import type { SessionState, ActionItem } from '../../types/transcription';
import { JudiciaryLogo } from '../common/JudiciaryLogo';
import { getDocxExportUrl } from '../../services/api';

interface MeetingDetailViewProps {
  session: SessionState;
  onBack: () => void;
  onToggleActionItem?: (actionId: string, completed: boolean) => void;
  onExport?: (format: 'markdown' | 'txt' | 'json') => void;
  onOpenReport?: () => void;
  /** Invoked by the explicit "Generate Judicial Hearing Report" CTA. */
  onRequestReport?: () => void;
  initialTab?: 'summary' | 'transcript' | 'actions';
}

interface SpeakerRoleInfo {
  role: string;
  hausaRole: string;
  badgeBg: string;
  cardBorder: string;
  avatarBg: string;
  isBench: boolean;
}

export const MeetingDetailView: React.FC<MeetingDetailViewProps> = ({
  session,
  onBack,
  onToggleActionItem,
  onExport,
  onOpenReport,
  onRequestReport,
  initialTab = 'summary',
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript' | 'actions'>(initialTab);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [audioDuration, setAudioDuration] = useState<number>(session.duration_seconds || 0);
  const [hasAudioError, setHasAudioError] = useState(false);
  const [activeSpeakerFilter, setActiveSpeakerFilter] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Real action items from this session
  const [actionItems, setActionItems] = useState<ActionItem[]>(
    session.summary?.action_items || []
  );

  useEffect(() => {
    if (session.summary?.action_items) {
      setActionItems(session.summary.action_items);
    }
  }, [session.summary?.action_items]);

  const toggleLocalAction = (id: string) => {
    setActionItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = !item.completed;
          if (onToggleActionItem) onToggleActionItem(id, updated);
          return { ...item, completed: updated };
        }
        return item;
      })
    );
  };

  const totalDuration = Math.max(1, Math.round(audioDuration || session.duration_seconds || 60));

  // Sync playback speed with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Pause audio on unmount
  useEffect(() => {
    const audioEl = audioRef.current;
    return () => {
      if (audioEl) {
        audioEl.pause();
      }
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current
        .play()
        .then(() => {
          setIsPlayingAudio(true);
          setHasAudioError(false);
        })
        .catch((err) => {
          console.warn('Real audio playback unavailable, falling back to simulated ticker:', err);
          setIsPlayingAudio(true);
        });
    }
  };

  const seekToTime = (secs: number) => {
    const clamped = Math.max(0, Math.min(totalDuration, secs));
    setPlaybackSeconds(clamped);
    if (audioRef.current) {
      audioRef.current.currentTime = clamped;
      if (!isPlayingAudio) {
        audioRef.current
          .play()
          .then(() => {
            setIsPlayingAudio(true);
            setHasAudioError(false);
          })
          .catch(() => {});
      }
    }
  };

  // Fallback ticker if audio file is missing or in mock mode
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlayingAudio && (!audioRef.current || hasAudioError)) {
      interval = setInterval(() => {
        setPlaybackSeconds((prev) => {
          if (prev >= totalDuration) {
            setIsPlayingAudio(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlayingAudio, hasAudioError, playbackSpeed, totalDuration]);

  const formatPlaybackTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Real speakers detected in this session
  const detectedSpeakers = session.final_transcript?.segments
    ? Array.from(new Set(session.final_transcript.segments.map((s) => s.speaker)))
    : session.summary?.speaker_contributions
    ? session.summary.speaker_contributions.map((c) => c.speaker)
    : [];

  const getSpeakerRoleInfo = (speakerName: string): SpeakerRoleInfo => {
    const lower = speakerName.toLowerCase();
    if (
      lower.includes('kadi') ||
      lower.includes('court') ||
      lower.includes('judge') ||
      lower.includes('alkali') ||
      lower.includes('bench') ||
      lower.includes('salihu')
    ) {
      return {
        role: 'Hon. Kadi / Presiding Bench',
        hausaRole: 'Kotun Daukaka Kara',
        badgeBg: 'bg-emerald-900 text-emerald-200 border border-emerald-700/60',
        cardBorder: 'border-emerald-600/40 bg-emerald-50/20',
        avatarBg: 'bg-[#008751] text-white',
        isBench: true,
      };
    }
    if (
      lower.includes('appellant') ||
      lower.includes('claimant') ||
      lower.includes('gambo') ||
      lower.includes('daukaka kara')
    ) {
      return {
        role: 'Counsel for Appellant',
        hausaRole: 'Lauyan Mai Daukaka Kara',
        badgeBg: 'bg-slate-900 text-slate-200 border border-slate-700',
        cardBorder: 'border-slate-200/90 bg-white',
        avatarBg: 'bg-slate-800 text-white',
        isBench: false,
      };
    }
    if (
      lower.includes('respondent') ||
      lower.includes('defendant') ||
      lower.includes('hadejia') ||
      lower.includes('wanda ake')
    ) {
      return {
        role: 'Counsel for Respondent',
        hausaRole: 'Lauyan Wanda Ake Daukaka Kara',
        badgeBg: 'bg-slate-800 text-amber-200 border border-amber-700/40',
        cardBorder: 'border-slate-200/90 bg-white',
        avatarBg: 'bg-slate-700 text-white',
        isBench: false,
      };
    }
    if (lower.includes('witness') || lower.includes('shaida')) {
      return {
        role: 'Witness / Shaida',
        hausaRole: 'Shaida',
        badgeBg: 'bg-amber-900 text-amber-200 border border-amber-700/60',
        cardBorder: 'border-amber-200/80 bg-amber-50/20',
        avatarBg: 'bg-amber-700 text-white',
        isBench: false,
      };
    }
    return {
      role: 'Litigant / Speaker',
      hausaRole: 'Mai Magana',
      badgeBg: 'bg-slate-100 text-slate-700 border border-slate-200',
      cardBorder: 'border-slate-200/90 bg-white',
      avatarBg: 'bg-slate-700 text-white',
      isBench: false,
    };
  };

  const handleCopySummary = async () => {
    const text = `${session.title || 'Court Proceeding Summary'}\n\nSuit Number: ${
      session.case_info?.case_number || 'N/A'
    }\nCourt: ${session.case_info?.court || 'Sharia Court of Appeal, Jigawa State'}\n\nOverview:\n${
      session.summary?.executive_summary || 'No summary available.'
    }\n\nDecisions & Directives:\n${
      session.summary?.decisions?.map((d) => `- ${d.decision}`).join('\n') || 'None recorded'
    }\n\nAction Items & Follow-ups:\n${
      actionItems
        .map((a) => `- [${a.completed ? 'x' : ' '}] ${a.task} (${a.assignee || 'Unassigned'})`)
        .join('\n') || 'None recorded'
    }`;
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  // The Word export endpoint refuses (404) until a report has been explicitly
  // generated, so the button is disabled with an explanatory tooltip until then.
  const hasReport = Boolean(session.hearing_report);

  const handleDownloadDocx = () => {
    if (!hasReport) return;
    const url = getDocxExportUrl(session.id);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Hearing_Report_${session.case_info?.case_number || session.id}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Nigerian Judiciary Emerald & Gold spectrum waveform bars
  const waveformColors = [
    '#008751', '#059669', '#10B981', '#34D399', '#D97706', '#F59E0B',
    '#008751', '#047857', '#059669', '#FBBF24', '#D97706', '#065F46',
    '#008751', '#10B981', '#F59E0B', '#047857', '#34D399', '#B45309',
    '#008751', '#059669', '#D97706', '#10B981', '#047857', '#F59E0B',
    '#008751', '#059669', '#10B981', '#34D399', '#D97706', '#047857',
  ];

  const segments = session.final_transcript?.segments || [];
  const filteredSegments = activeSpeakerFilter
    ? segments.filter((s) => s.speaker === activeSpeakerFilter)
    : segments;

  const caseNum = session.case_info?.case_number || 'JGS/SCA/DTS/CV/018/2026';
  const courtName = session.case_info?.court || 'Sharia Court of Appeal of Jigawa State';
  const divisionName = session.case_info?.division || 'Dutse Judicial Division';
  const judgeName = session.case_info?.judge || 'Hon. Kadi Sani Salihu (Hon. Grand Kadi)';
  const hearingDate = session.case_info?.hearing_date || session.started_at || '21 September 2026';
  const appellantName =
    session.parties?.claimant || 'Alhaji Haruna Garba & Ors (Mai Daukaka Kara)';
  const respondentName =
    session.parties?.defendant || 'Malam Mustapha Suleiman (Wanda Ake Daukaka Kara)';

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F8FAF9] text-slate-900 overflow-hidden relative select-none">
      {/* Top Header Control Strip */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-3 pb-2.5 flex-shrink-0 bg-white/90 backdrop-blur-sm border-b border-slate-200/80">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white hover:bg-slate-100 border border-slate-200/90 active:scale-[0.98] transition-all flex items-center justify-center text-slate-700 shadow-xs cursor-pointer"
            title="Back to Cause Docket"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#008751] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                Official Hearing Record
              </span>
              <span className="text-[10px] font-mono text-slate-500 font-semibold hidden sm:inline">
                {caseNum}
              </span>
            </div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate max-w-[200px] sm:max-w-md mt-0.5">
              {activeTab === 'transcript'
                ? 'Diarized Audio & Speech Transcript'
                : activeTab === 'actions'
                ? 'Court Orders & Compliance Directives'
                : 'Proceedings Summary & Key Decisions'}
            </h2>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {hasReport && onOpenReport && (
            <button
              onClick={onOpenReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#008751] hover:bg-[#007345] active:scale-[0.98] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="View & Export Judicial Hearing Report"
            >
              <Scale className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Hearing Report</span>
              <span className="sm:hidden">Report</span>
            </button>
          )}
          {!hasReport && onRequestReport && (
            <button
              onClick={onRequestReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-500 active:scale-[0.98] text-amber-950 text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="Reports are generated on demand — click to create the Judicial Hearing Report now"
            >
              <Scale className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Generate Report</span>
              <span className="sm:hidden">Report</span>
            </button>
          )}

          <button
            onClick={handleDownloadDocx}
            disabled={!hasReport}
            className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-xs ${
              hasReport
                ? 'bg-white hover:bg-slate-100 active:scale-[0.98] border-slate-200/90 text-slate-700 cursor-pointer'
                : 'bg-slate-50 border-slate-200/60 text-slate-400 cursor-not-allowed'
            }`}
            title={hasReport ? 'Download Word Document (.docx)' : 'Generate the report first to enable Word export'}
          >
            <FileDown className={`w-3.5 h-3.5 ${hasReport ? 'text-[#008751]' : 'text-slate-300'}`} />
            <span>Word</span>
          </button>

          <button
            onClick={() => onExport && onExport('markdown')}
            className="w-9 h-9 rounded-xl bg-white hover:bg-slate-100 active:scale-[0.98] border border-slate-200/90 transition-all flex items-center justify-center text-slate-700 shadow-xs cursor-pointer"
            title="Export Record (Markdown / TXT)"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Case Overview Banner Card */}
      <div className="px-4 sm:px-6 pt-3 pb-2 flex-shrink-0">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
          {/* Top Metadata Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <JudiciaryLogo size="sm" variant="crest" lightMode={true} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {caseNum}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                    {divisionName}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {courtName}
                </p>
              </div>
            </div>

            {/* Presiding & Date */}
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-1 font-medium">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{hearingDate}</span>
              </div>
              <div className="flex items-center gap-1 font-mono text-slate-500">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{formatPlaybackTime(totalDuration)}</span>
              </div>
            </div>
          </div>

          {/* Litigants Row + Quick Audio Launcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span className="text-emerald-700">Appellant:</span>
                <span className="truncate max-w-xs">{appellantName}</span>
              </div>
              <div className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <span className="text-slate-500 font-semibold">Respondent:</span>
                <span className="truncate max-w-xs">{respondentName}</span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1 pt-0.5">
                <Gavel className="w-3 h-3 text-[#008751]" />
                <span className="truncate max-w-sm">Coram: {judgeName}</span>
              </div>
            </div>

            {/* Quick Audio Replay Pill */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={togglePlay}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-[0.98] shadow-xs cursor-pointer ${
                  isPlayingAudio
                    ? 'bg-[#008751] text-white shadow-emerald-700/20'
                    : 'bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-[#008751]'
                }`}
                title={isPlayingAudio ? 'Pause proceeding audio' : 'Play proceeding audio'}
              >
                {isPlayingAudio ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-white" />
                    <span>Pause Audio</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    <span>Play Audio ({formatPlaybackTime(totalDuration)})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Segmented Tab Switcher */}
      <div className="px-4 sm:px-6 pt-1 pb-3 flex-shrink-0 sticky top-0 z-10 bg-[#F8FAF9]/95 backdrop-blur">
        <div role="tablist" aria-label="Record sections" className="grid grid-cols-3 bg-slate-200/70 p-1 rounded-xl text-xs font-semibold border border-slate-300/40 relative select-none">
          <button
            role="tab"
            aria-selected={activeTab === 'summary'}
            onClick={() => setActiveTab('summary')}
            className={`py-2.5 px-2 min-h-[44px] rounded-lg text-center transition-all cursor-pointer ${
              activeTab === 'summary'
                ? 'bg-white text-slate-900 font-bold shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                : 'text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            Summary & Decisions
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'transcript'}
            onClick={() => setActiveTab('transcript')}
            className={`py-2.5 px-2 min-h-[44px] rounded-lg text-center transition-all cursor-pointer ${
              activeTab === 'transcript'
                ? 'bg-white text-slate-900 font-bold shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                : 'text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            Record & Audio
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'actions'}
            onClick={() => setActiveTab('actions')}
            className={`py-2 px-2 min-h-[44px] rounded-lg text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'actions'
                ? 'bg-white text-slate-900 font-bold shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                : 'text-slate-600 hover:text-slate-900 font-medium'
            }`}
          >
            <span>Orders & Tasks</span>
            {actionItems.length > 0 && (
              <span className="bg-[#008751] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {actionItems.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Scrollable Content Area */}
      <div
        key={activeTab}
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-32 space-y-4 page-enter-fade"
      >
        {/* ================= TAB 1: SUMMARY & DECISIONS ================= */}
        {activeTab === 'summary' && (
          <div className="space-y-4">
            {/* Overview Card */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#008751] flex items-center justify-center font-bold">
                  <FileCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Executive Summary of Proceedings (Bayanin Zama)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Synthesized from audio transcription and submissions
                  </p>
                </div>
              </div>

              {session.summary?.executive_summary ? (
                <p className="text-sm text-slate-700 leading-relaxed font-normal">
                  {session.summary.executive_summary}
                </p>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  Summary processing or not available for this session.
                </p>
              )}
            </div>

            {/* Directives & Decisions Card */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#008751] flex items-center justify-center font-bold">
                    <Gavel className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Court Directives & Decisions (Hukunci)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Binding pronouncements recorded during this sitting
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-[#008751] bg-emerald-50 px-2 py-0.5 rounded">
                  {session.summary?.decisions?.length || 0} Decrees
                </span>
              </div>

              {session.summary?.decisions && session.summary.decisions.length > 0 ? (
                <div className="space-y-2.5 pt-1">
                  {session.summary.decisions.map((dec, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-[#082E20] text-white flex items-start gap-3 shadow-xs"
                    >
                      <span className="w-5 h-5 rounded-full bg-emerald-700/80 text-emerald-200 text-[10px] font-mono font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <p className="text-xs font-medium leading-relaxed text-white">
                        {dec.decision}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic py-2">
                  No specific judicial decrees were pronounced on record for this sitting.
                </p>
              )}
            </div>

            {/* Action Items / Follow-up Tasks */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#008751] flex items-center justify-center font-bold">
                    <Check className="w-4 h-4 stroke-[2.5]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Registry & Counsel Tasks
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Filing deadlines and compliance requirements
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {actionItems.length} Tasks
                </span>
              </div>

              {actionItems.length > 0 ? (
                <div className="space-y-2 pt-1">
                  {actionItems.map((act) => {
                    const initial = act.assignee ? act.assignee[0].toUpperCase() : 'U';

                    return (
                      <div
                        key={act.id}
                        onClick={() => toggleLocalAction(act.id)}
                        className="bg-slate-50/70 rounded-xl p-3 border border-slate-200/80 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:border-emerald-300 hover:bg-white transition-all active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                              act.completed
                                ? 'bg-[#008751] text-white shadow-xs'
                                : 'border-2 border-slate-300 bg-white'
                            }`}
                          >
                            {act.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </button>
                          <span
                            className={`text-xs sm:text-sm font-medium ${
                              act.completed ? 'text-slate-400 line-through' : 'text-slate-800'
                            }`}
                          >
                            {act.task}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {act.deadline && (
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                                act.completed
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-200/70 text-slate-700'
                              }`}
                            >
                              {act.deadline}
                            </span>
                          )}
                          <div className="w-6 h-6 rounded-full bg-[#008751] text-white text-[10px] font-bold flex items-center justify-center">
                            {initial}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic py-2">
                  No registry action items or filing deadlines recorded for this session.
                </p>
              )}
            </div>

            {/* Bottom Action Buttons (Aligned, Structured, Tactile) */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              {hasReport && onOpenReport && (
                <button
                  onClick={onOpenReport}
                  className="w-full sm:flex-1 bg-[#008751] hover:bg-[#007345] active:scale-[0.98] text-white py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <Scale className="w-4 h-4" />
                  <span>Open Full Judicial Hearing Report</span>
                </button>
              )}
              {!hasReport && onRequestReport && (
                <button
                  onClick={onRequestReport}
                  className="w-full sm:flex-1 bg-amber-400 hover:bg-amber-500 active:scale-[0.98] text-amber-950 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <Scale className="w-4 h-4" />
                  <span>Generate Judicial Hearing Report</span>
                </button>
              )}
              <button
                onClick={handleCopySummary}
                className="w-full sm:w-auto bg-white hover:bg-slate-50 border border-slate-200/90 active:scale-[0.98] text-slate-800 py-3 px-5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                {copySuccess ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-500" />
                )}
                <span>{copySuccess ? 'Copied to Clipboard' : 'Copy Summary'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= TAB 2: RECORD & AUDIO ================= */}
        {activeTab === 'transcript' && (
          <div className="space-y-4">
            {/* Audio Waveform Soundboard Console */}
            <div className="rounded-2xl border border-slate-200/90 shadow-[0_2px_8px_rgba(0,0,0,0.04)] bg-white overflow-hidden">
              {/* Upper Deck: Dark Forest Soundboard Header */}
              <div className="bg-[#042A1D] text-white p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-emerald-200/80">
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold tracking-wide uppercase text-[10px]">
                      Proceedings Audio Console
                    </span>
                  </div>
                  <span className="font-mono text-emerald-300 font-bold">
                    {formatPlaybackTime(playbackSeconds)} / {formatPlaybackTime(totalDuration)}
                  </span>
                </div>

                {/* Tactile Play Button + Waveform Scrubber */}
                <div className="flex items-center gap-3.5">
                  <button
                    onClick={togglePlay}
                    className="w-12 h-12 rounded-full bg-[#008751] hover:bg-[#007345] active:scale-95 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-950/40 transition-all cursor-pointer"
                    title={isPlayingAudio ? 'Pause Audio' : 'Play Audio'}
                  >
                    {isPlayingAudio ? (
                      <Pause className="w-5 h-5 fill-white" />
                    ) : (
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    )}
                  </button>

                  {/* Multi-Color Audio Waveform Spectrum with Seeking */}
                  <div
                    className="flex-1 flex items-center justify-between gap-[2px] h-10 px-2 cursor-pointer py-1 group select-none bg-black/25 rounded-xl border border-emerald-500/20"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickRatio = Math.max(
                        0,
                        Math.min(1, (e.clientX - rect.left) / rect.width)
                      );
                      seekToTime(clickRatio * totalDuration);
                    }}
                    title="Click anywhere to scrub audio"
                  >
                    {waveformColors.map((color, idx) => {
                      const heightPercent =
                        25 +
                        Math.sin(idx * 0.7 + (isPlayingAudio ? playbackSeconds * 5 : 0)) * 55;
                      const isActive =
                        idx < (playbackSeconds / totalDuration) * waveformColors.length;

                      return (
                        <div
                          key={idx}
                          className="w-[3px] rounded-full transition-all duration-100 group-hover:scale-y-110"
                          style={{
                            height: `${Math.max(15, Math.min(95, heightPercent))}%`,
                            backgroundColor: isActive ? color : `${color}40`,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Lower Deck: Speed Selector & Soundboard Meta */}
              <div className="bg-[#082E20] px-4 py-2.5 flex items-center justify-between border-t border-emerald-900/40 text-xs text-white">
                <div className="flex items-center gap-1.5 text-emerald-200/80 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Diarized Court Recording</span>
                </div>

                {/* Speed Toggle Chips */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-emerald-300 font-semibold mr-1">Speed:</span>
                  {[1, 1.25, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-all cursor-pointer active:scale-95 ${
                        playbackSpeed === speed
                          ? 'bg-[#008751] text-white shadow-xs'
                          : 'bg-white/10 text-emerald-200 hover:bg-white/20'
                      }`}
                    >
                      {speed}×
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Speaker Filter Pills */}
            {detectedSpeakers.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-semibold text-slate-600 no-scrollbar">
                <button
                  onClick={() => setActiveSpeakerFilter(null)}
                  className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
                    activeSpeakerFilter === null
                      ? 'bg-[#008751] text-white shadow-xs'
                      : 'bg-white border border-slate-200/90 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  All Speakers ({segments.length})
                </button>
                {detectedSpeakers.map((sp) => {
                  const info = getSpeakerRoleInfo(sp);
                  const isSelected = activeSpeakerFilter === sp;

                  return (
                    <button
                      key={sp}
                      onClick={() => setActiveSpeakerFilter(isSelected ? null : sp)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
                        isSelected
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-white border border-slate-200/90 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${info.avatarBg}`} />
                      <span>{sp}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Diarized Transcript Segment Cards */}
            <div className="space-y-3 pt-1">
              {filteredSegments.length === 0 ? (
                <div className="text-center py-12 px-4 bg-white rounded-2xl border border-slate-200/90 text-slate-500 text-xs space-y-2">
                  <p className="font-semibold text-slate-700">No transcript segments found.</p>
                  <p className="text-slate-400">
                    Live speech will be processed and transcribed here.
                  </p>
                </div>
              ) : (
                filteredSegments.map((seg) => {
                  const info = getSpeakerRoleInfo(seg.speaker);
                  const initial = seg.speaker ? seg.speaker[0].toUpperCase() : 'S';
                  const isActiveSegment =
                    isPlayingAudio &&
                    playbackSeconds >= seg.start &&
                    playbackSeconds <= (seg.end || seg.start + 3);

                  return (
                    <article
                      key={seg.id}
                      className={`rounded-2xl p-4 border transition-all flex items-start gap-3.5 shadow-xs ${
                        isActiveSegment
                          ? 'bg-emerald-50/70 border-[#008751] ring-2 ring-[#008751]/25'
                          : info.isBench
                          ? 'bg-emerald-50/30 border-emerald-200/80 hover:border-emerald-300'
                          : 'bg-white border-slate-200/90 hover:border-slate-300'
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-xl text-white text-xs font-bold flex items-center justify-center flex-shrink-0 shadow-xs ${info.avatarBg}`}
                      >
                        {initial}
                      </div>

                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-bold text-slate-900">
                              {seg.speaker}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${info.badgeBg}`}
                            >
                              {info.role}
                            </span>
                          </div>

                          {/* Jump to Time Button */}
                          <button
                            onClick={() => seekToTime(seg.start)}
                            className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 hover:text-[#008751] bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer active:scale-95"
                            title={`Jump audio to ${formatPlaybackTime(seg.start)}`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>{formatPlaybackTime(seg.start)}</span>
                          </button>
                        </div>

                        <p className="text-xs sm:text-sm text-slate-800 leading-relaxed font-normal">
                          {seg.text}
                        </p>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: ORDERS & TASKS ================= */}
        {activeTab === 'actions' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#008751] flex items-center justify-center font-bold">
                    <Gavel className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Enforceable Judicial Orders (Hukuncin Kotu)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Court rulings and directives binding upon all parties
                    </p>
                  </div>
                </div>
              </div>

              {session.summary?.decisions && session.summary.decisions.length > 0 ? (
                <div className="space-y-3 pt-1">
                  {session.summary.decisions.map((dec, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-[#082E20] text-white space-y-1.5 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                          Judicial Directive #{idx + 1}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-200/70">
                          {caseNum}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm font-semibold leading-relaxed text-white">
                        {dec.decision}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic py-2">
                  No judicial orders recorded for this session.
                </p>
              )}
            </div>

            {/* Task Checklist */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900">
                  Compliance Checklist ({actionItems.length})
                </h3>
              </div>

              {actionItems.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">
                  No compliance tasks assigned for this sitting.
                </p>
              ) : (
                <div className="space-y-2">
                  {actionItems.map((act) => (
                    <div
                      key={act.id}
                      onClick={() => toggleLocalAction(act.id)}
                      className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200/80 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:border-emerald-300 hover:bg-white transition-all active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                            act.completed
                              ? 'bg-[#008751] text-white shadow-xs'
                              : 'border-2 border-slate-300 bg-white'
                          }`}
                        >
                          {act.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>
                        <div>
                          <p
                            className={`text-xs sm:text-sm font-medium ${
                              act.completed ? 'text-slate-400 line-through' : 'text-slate-900'
                            }`}
                          >
                            {act.task}
                          </p>
                          <span className="text-[11px] text-slate-400">
                            Assigned to {act.assignee || 'Unassigned'}
                          </span>
                        </div>
                      </div>

                      {act.deadline && (
                        <span
                          className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                            act.completed
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-200/70 text-slate-700'
                          }`}
                        >
                          {act.deadline}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Link to Report */}
            {onOpenReport && (
              <div className="pt-2">
                <button
                  onClick={onOpenReport}
                  className="w-full bg-[#008751] hover:bg-[#007345] active:scale-[0.98] text-white py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  <Scale className="w-4 h-4" />
                  <span>Generate Certified Court Report with Orders</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden real audio element for meeting replay */}
      <audio
        ref={audioRef}
        src={session.audio_url || `/api/sessions/${session.id}/audio`}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const dur = e.currentTarget.duration;
          if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
            setAudioDuration(dur);
          }
        }}
        onTimeUpdate={(e) => {
          setPlaybackSeconds(e.currentTarget.currentTime);
        }}
        onEnded={() => {
          setIsPlayingAudio(false);
          setPlaybackSeconds(0);
        }}
        onError={() => {
          setHasAudioError(true);
        }}
      />
    </div>
  );
};
