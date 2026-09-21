import React, { useState, useEffect } from 'react';
import { PhoneFrame } from '../phone/PhoneFrame';
import { ButtonPlate, type AppPage } from './ButtonPlate';

import { MeetingsListView } from '../views/MeetingsListView';
import { LiveRecordingView } from '../views/LiveRecordingView';
import { MeetingDetailView } from '../views/MeetingDetailView';
import { GlobalActionsView } from '../views/GlobalActionsView';
import { HearingReportView } from '../views/HearingReportView';
import { NewHearingModal } from '../views/NewHearingModal';
import { useRecordingSession } from '../../hooks/useRecordingSession';
import type { SessionState, MeetingSummary, CaseInformation, HearingParties } from '../../types/transcription';
import { updateCaseInfo } from '../../services/api';
import { Mic, FileText, FileCheck, Scale, Plus, Gavel } from 'lucide-react';
import { JudiciaryLogo } from '../common/JudiciaryLogo';

const LOCAL_STORAGE_KEY = 'jigawa_sharia_court_sessions_v3';

const PAGE_ORDER: Record<string, number> = {
  meetings: 0,
  transcript: 1,
  summary: 1,
  report: 2,
  actions: 3,
  live: 4,
};

const DEFAULT_CASE_INFO: CaseInformation = {
  case_number: 'JGS/SCA/DTS/CV/018/2026',
  court: 'Sharia Court of Appeal, Jigawa State',
  division: 'Dutse Judicial Division',
  judge: 'Hon. Kadi Sani Salihu (Hon. Grand Kadi)',
  coram: [
    'Hon. Kadi Sani Salihu (Hon. Grand Kadi / Presiding)',
    'Hon. Kadi Abubakar M. Gumel (Hon. Kadi)',
    'Hon. Kadi Usman Birnin Kudu (Hon. Kadi)',
  ],
  hearing_date: '21 September 2026',
  hearing_type: 'Civil Appeal (Islamic Personal Law / Mirath)',
  duration: '00:00:00',
  hearing_no: '2',
};

const DEFAULT_PARTIES: HearingParties = {
  claimant: 'Alhaji Haruna Garba & Ors (Mai Daukaka Kara / Appellant)',
  counsel_claimant: 'Barr. Ibrahim Gambo Dutse',
  defendant: 'Malam Mustapha Suleiman (Wanda Ake Daukaka Kara / Respondent)',
  counsel_defendant: 'Barr. Aisha Mohammed Hadejia',
  witnesses: [],
};

export const MainLayout: React.FC = () => {
  const {
    sessionId,
    status,
    processingStage,
    languageMode,
    liveTranscript,
    interimText,
    finalTranscript,
    summary,
    recordingSeconds,
    isPaused,
    analyserNode,
    errorMessage,
    startSession,
    pauseRecording,
    resumeRecording,
    stopSession,
    toggleActionItem,
    exportSession,
  } = useRecordingSession();

  // Active page state for universal navigation
  const [activePage, setActivePage] = useState<AppPage>('meetings');
  const [navDirection, setNavDirection] = useState<'forward' | 'backward' | 'up' | 'fade'>('fade');

  // Case setup state
  const [activeCaseInfo, setActiveCaseInfo] = useState<CaseInformation>(DEFAULT_CASE_INFO);
  const [activeParties, setActiveParties] = useState<HearingParties>(DEFAULT_PARTIES);
  const [isNewHearingModalOpen, setIsNewHearingModalOpen] = useState(false);

  const navigateTo = (newPage: AppPage, customDir?: 'forward' | 'backward' | 'up' | 'fade') => {
    if (newPage === activePage) return;

    let dir: 'forward' | 'backward' | 'up' | 'fade' = customDir || 'fade';
    if (!customDir) {
      if (newPage === 'live') {
        dir = 'up';
      } else if (activePage === 'live') {
        dir = 'backward';
      } else {
        const fromIdx = PAGE_ORDER[activePage] ?? 0;
        const toIdx = PAGE_ORDER[newPage] ?? 0;
        dir = toIdx > fromIdx ? 'forward' : toIdx < fromIdx ? 'backward' : 'fade';
      }
    }

    setNavDirection(dir);

    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as any).startViewTransition(() => {
        setActivePage(newPage);
      });
    } else {
      setActivePage(newPage);
    }
  };

  const [sessions, setSessions] = useState<SessionState[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [selectedSession, setSelectedSession] = useState<SessionState | null>(null);

  // Sync with backend sessions on mount
  useEffect(() => {
    fetch('/api/sessions')
      .then((res) => (res.ok ? res.json() : []))
      .then((backendSessions: SessionState[]) => {
        if (backendSessions && backendSessions.length > 0) {
          setSessions((prev) => {
            const map = new Map<string, SessionState>();
            prev.forEach((s) => map.set(s.id, s));
            backendSessions.forEach((s) => map.set(s.id, s));
            const merged = Array.from(map.values());
            try {
              localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(merged));
            } catch {}
            return merged;
          });
        }
      })
      .catch((err) => console.log('Backend sync:', err));
  }, []);

  // Save sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
    } catch {}
  }, [sessions]);

  // When recording status becomes 'recording', navigate to 'live'
  useEffect(() => {
    if (status === 'recording') {
      navigateTo('live', 'up');
    }
  }, [status]);

  // When post-recording processing finishes, save session and jump to 'report'
  useEffect(() => {
    if (status === 'complete') {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const finalSessionSummary: MeetingSummary = summary || {
        executive_summary: liveTranscript.length > 0
          ? liveTranscript.map((t) => t.text).join(' ')
          : 'Audio recording captured and processed.',
        key_points: ['Session recorded and transcribed successfully.'],
        decisions: [],
        action_items: [],
        questions: [],
        speaker_contributions: [],
      };

      const meetingTitle = `${activeCaseInfo.case_number} · ${activeCaseInfo.court}`;

      const newSession: SessionState = {
        id: sessionId || `session_${Date.now()}`,
        title: meetingTitle,
        status: 'complete',
        started_at: `Today at ${timeStr}`,
        ended_at: timeStr,
        duration_seconds: recordingSeconds || 1,
        language_mode: languageMode,
        live_transcript: liveTranscript,
        final_transcript: finalTranscript || undefined,
        summary: finalSessionSummary,
        case_info: activeCaseInfo,
        parties: activeParties,
        speaker_names: {},
      };

      // Persist case info to backend session
      if (sessionId) {
        updateCaseInfo(sessionId, activeCaseInfo, activeParties).catch((err) =>
          console.warn('Auto case update failed:', err)
        );
      }

      setSessions((prev) => [newSession, ...prev.filter((s) => s.id !== newSession.id)]);
      setSelectedSession(newSession);

      // Brief delay so the user clearly perceives the 100% complete state before switching to report
      const timer = setTimeout(() => {
        navigateTo('report', 'forward');
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [status, summary, sessionId, recordingSeconds, languageMode, liveTranscript, finalTranscript, activeCaseInfo, activeParties]);

  const handleStartHearingWithCase = (caseInfo: CaseInformation, parties: HearingParties) => {
    setActiveCaseInfo(caseInfo);
    setActiveParties(parties);
    startSession(languageMode);
    navigateTo('live', 'up');
  };

  const handleStopRecording = () => {
    stopSession();
  };

  const handleSelectMeeting = (session: SessionState) => {
    setSelectedSession(session);
    if (session.case_info) {
      setActiveCaseInfo(session.case_info);
    }
    if (session.parties) {
      setActiveParties(session.parties);
    }
    navigateTo('transcript', 'forward');
  };



  // Determine theme for current page
  const pageTheme = activePage === 'live' && status === 'recording' ? 'royal' : 'light';
  const effectiveSession = selectedSession || (sessions.length > 0 ? sessions[0] : null);

  return (
    <div className="fixed inset-0 w-full h-full bg-[#F4F7F5] text-slate-900 flex flex-col overflow-hidden select-none selection:bg-[#008751]/30 font-sans">
      {/* Subtle Nigerian National Flag Tricolor Accent Ribbon */}
      <div className="w-full h-1 nigerian-tricolor flex-shrink-0 z-50 no-print" />

      {/* Main Responsive App Body */}
      <main className="flex-1 min-h-0 w-full max-w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto flex flex-col overflow-hidden relative bg-[#F8FAF9] sm:border-x sm:border-emerald-900/10 sm:shadow-lg">
        {/* Floating Minimal Judicial Header Bar */}
        {activePage !== 'live' && (
          <div className="absolute top-2.5 left-3 right-3 sm:left-6 sm:right-6 z-40 no-print flex justify-center pointer-events-none">
            <header className="pointer-events-auto w-full max-w-4xl bg-white/92 hover:bg-white backdrop-blur-md border border-slate-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.06)] rounded-2xl px-3 sm:px-4 py-2 flex items-center justify-between transition-all">
              {/* Left: Emblem & Court Title */}
              <div
                onClick={() => navigateTo('meetings', 'backward')}
                className="flex items-center gap-2.5 cursor-pointer select-none active:scale-95 transition-all"
                title="View All Court Proceedings"
              >
                <JudiciaryLogo size="sm" variant="crest" lightMode={true} />
                <div>
                  <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 leading-tight">
                    Sharia Court of Appeal
                  </h1>
                  <p className="text-[10px] text-slate-500 leading-none hidden sm:block">
                    Jigawa State Judiciary · Dutse
                  </p>
                </div>
              </div>

              {/* Center: Active Suit Number Badge */}
              <button
                onClick={() => setIsNewHearingModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-[11px] font-semibold text-slate-800 transition-all cursor-pointer active:scale-95"
                title="Edit / Configure Case Information"
              >
                <Gavel className="w-3 h-3 text-[#008751]" />
                <span className="font-mono truncate max-w-[120px] sm:max-w-[190px]">
                  {effectiveSession?.case_info?.case_number || activeCaseInfo.case_number}
                </span>
              </button>

              {/* Right: Actions */}
              <div className="flex items-center gap-2">
                {effectiveSession && (
                  <button
                    onClick={() => navigateTo('report', 'forward')}
                    className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                      activePage === 'report'
                        ? 'bg-emerald-100 text-emerald-950 border border-emerald-300 font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                    title="View Judicial Hearing Report"
                  >
                    <Scale className="w-3.5 h-3.5 text-[#008751]" />
                    <span>Report</span>
                  </button>
                )}

                <button
                  onClick={() => setIsNewHearingModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
                  title="Configure & Record New Hearing"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New Hearing</span>
                  <span className="sm:hidden">New</span>
                </button>
              </div>
            </header>
          </div>
        )}

        {/* Main Mobile/Desktop App Container */}
        <PhoneFrame theme={pageTheme}>
          {/* Content Body Area with fluid directional motion */}
          <div
            key={activePage}
            className={`flex-1 min-h-0 flex flex-col overflow-hidden relative ${
              activePage !== 'live' ? 'pt-[76px] sm:pt-[82px]' : ''
            } ${
              navDirection === 'forward'
                ? 'page-enter-forward'
                : navDirection === 'backward'
                ? 'page-enter-backward'
                : navDirection === 'up'
                ? 'page-enter-up'
                : 'page-enter-fade'
            }`}
          >
            {/* 1. Meetings Page */}
            {activePage === 'meetings' && (
              <MeetingsListView
                sessions={sessions}
                onSelectMeeting={handleSelectMeeting}
                onStartRecord={() => setIsNewHearingModalOpen(true)}
              />
            )}

            {/* 2. Live Recording Page */}
            {activePage === 'live' && (
              <LiveRecordingView
                title={status === 'recording' ? 'Live Hearing Recording' : status === 'processing' ? 'Processing Recording' : 'Audio Stream'}
                recordingSeconds={recordingSeconds}
                liveTranscript={liveTranscript}
                interimText={interimText}
                analyserNode={analyserNode}
                isPaused={isPaused}
                isProcessing={status === 'processing'}
                processingStage={processingStage}
                errorMessage={errorMessage}
                onPause={pauseRecording}
                onResume={resumeRecording}
                onMinimize={() => navigateTo('meetings', 'backward')}
                onStop={handleStopRecording}
                onViewTranscript={() => navigateTo('report', 'forward')}
                languageMode={languageMode}
              />
            )}

            {/* 3. Transcript Page */}
            {activePage === 'transcript' && (
              effectiveSession ? (
                <MeetingDetailView
                  session={effectiveSession}
                  initialTab="summary"
                  onBack={() => navigateTo('meetings', 'backward')}
                  onToggleActionItem={toggleActionItem}
                  onExport={exportSession}
                  onOpenReport={() => navigateTo('report', 'forward')}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-3 bg-[#F8FAFC]">
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <FileText className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">No Transcript Yet</h3>
                  <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                    Record a hearing or select an existing session from Proceedings to inspect its speaker-diarized transcript and playback.
                  </p>
                  <button
                    onClick={() => setIsNewHearingModalOpen(true)}
                    className="px-4 py-2 rounded-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-semibold shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Start Hearing</span>
                  </button>
                </div>
              )
            )}

            {/* 4. Judicial Hearing Report Page */}
            {activePage === 'report' && (
              effectiveSession ? (
                <HearingReportView
                  session={effectiveSession}
                  onBack={() => navigateTo('transcript', 'backward')}
                  onJumpToTimestamp={() => navigateTo('transcript', 'backward')}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-3 bg-[#F8FAFC]">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center text-[#008751] border border-emerald-200">
                    <Scale className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">No Hearing Report Yet</h3>
                  <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                    Start a hearing recording or select an existing proceeding to synthesize an authoritative 12-section Judicial Hearing Report with PDF & Word export.
                  </p>
                  <button
                    onClick={() => setIsNewHearingModalOpen(true)}
                    className="px-4 py-2 rounded-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-semibold shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Setup New Hearing</span>
                  </button>
                </div>
              )
            )}

            {/* 5. Summary Page */}
            {activePage === 'summary' && (
              effectiveSession ? (
                <MeetingDetailView
                  session={effectiveSession}
                  initialTab="summary"
                  onBack={() => navigateTo('meetings', 'backward')}
                  onToggleActionItem={toggleActionItem}
                  onExport={exportSession}
                  onOpenReport={() => navigateTo('report', 'forward')}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-3 bg-[#F8FAFC]">
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <FileCheck className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">No Summary Yet</h3>
                  <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                    Once a recording concludes, an executive summary, decisions, and action items will be generated here.
                  </p>
                  <button
                    onClick={() => setIsNewHearingModalOpen(true)}
                    className="px-4 py-2 rounded-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-semibold shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Start Hearing</span>
                  </button>
                </div>
              )
            )}

            {/* 6. Actions Page */}
            {activePage === 'actions' && (
              <GlobalActionsView
                sessions={sessions}
                onBack={() => navigateTo('meetings', 'backward')}
                onSelectMeeting={(session) => {
                  setSelectedSession(session);
                  navigateTo('transcript', 'forward');
                }}
                onStartHearing={() => setIsNewHearingModalOpen(true)}
              />
            )}
          </div>

          {/* Universal Floating Button Plate (Docked at bottom of ALL pages!) */}
          <ButtonPlate
            activePage={activePage}
            onNavigate={(page) => navigateTo(page)}
            hasSession={Boolean(effectiveSession)}
            theme={pageTheme}
          />
        </PhoneFrame>
      </main>

      {/* New Hearing Setup Modal */}
      <NewHearingModal
        isOpen={isNewHearingModalOpen}
        onClose={() => setIsNewHearingModalOpen(false)}
        initialCaseInfo={effectiveSession?.case_info || activeCaseInfo}
        initialParties={effectiveSession?.parties || activeParties}
        onStartHearing={handleStartHearingWithCase}
        onSaveCaseInfo={(caseInfo, parties) => {
          setActiveCaseInfo(caseInfo);
          setActiveParties(parties);
          if (effectiveSession) {
            updateCaseInfo(effectiveSession.id, caseInfo, parties)
              .then((updated) => {
                setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                setSelectedSession(updated);
              })
              .catch((err) => console.warn('Case info update:', err));
          }
        }}
      />
    </div>
  );
};
