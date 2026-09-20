import React, { useState, useEffect, useMemo } from 'react';
import { PhoneFrame } from '../phone/PhoneFrame';
import { ButtonPlate, type AppPage } from './ButtonPlate';

import { MeetingsListView } from '../views/MeetingsListView';
import { LiveRecordingView } from '../views/LiveRecordingView';
import { MeetingDetailView } from '../views/MeetingDetailView';
import { GlobalActionsView } from '../views/GlobalActionsView';
import { useRecordingSession } from '../../hooks/useRecordingSession';
import type { SessionState, MeetingSummary } from '../../types/transcription';
import { Mic, FileText, FileCheck } from 'lucide-react';
import { JudiciaryLogo } from '../common/JudiciaryLogo';

const LOCAL_STORAGE_KEY = 'verba_user_sessions_v1';

const PAGE_ORDER: Record<string, number> = {
  meetings: 0,
  transcript: 1,
  summary: 1,
  actions: 2,
  live: 3,
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

  // When post-recording processing finishes, save session and jump to 'transcript'
  useEffect(() => {
    if (status === 'complete') {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });

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

      const meetingTitle = summary?.executive_summary
        ? (summary.executive_summary.length > 45 ? summary.executive_summary.slice(0, 42).trim() + '...' : summary.executive_summary)
        : `Meeting · ${dateStr}, ${timeStr}`;

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
        speaker_names: {},
      };

      setSessions((prev) => [newSession, ...prev.filter((s) => s.id !== newSession.id)]);
      setSelectedSession(newSession);

      // Brief delay so the user clearly perceives the 100% complete state before switching
      const timer = setTimeout(() => {
        navigateTo('transcript', 'forward');
      }, 750);
      return () => clearTimeout(timer);
    }
  }, [status, summary, sessionId, recordingSeconds, languageMode, liveTranscript, finalTranscript]);

  const handleStartRecording = () => {
    startSession(languageMode);
    navigateTo('live', 'up');
  };

  const handleStopRecording = () => {
    stopSession();
  };

  const handleSelectMeeting = (session: SessionState) => {
    setSelectedSession(session);
    navigateTo('transcript', 'forward');
  };

  // Compute total uncompleted action items across all sessions
  const totalActionCount = useMemo(() => {
    return sessions.reduce((acc, s) => {
      return acc + (s.summary?.action_items?.filter((a) => !a.completed).length || 0);
    }, 0);
  }, [sessions]);

  // Determine theme for current page
  const pageTheme = activePage === 'live' ? 'royal' : 'light';
  const effectiveSession = selectedSession || (sessions.length > 0 ? sessions[0] : null);

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full bg-[#F4F7F5] text-slate-900 flex flex-col overflow-hidden relative selection:bg-[#008751]/30 font-sans">
      {/* Official Nigerian National Flag Tricolor Accent Ribbon */}
      <div className="w-full h-1 nigerian-tricolor flex-shrink-0 z-50" />

      {/* Official Nigerian Judiciary Top Header Bar */}
      <header className="w-full bg-[#043320] text-white border-b border-emerald-900/60 px-4 sm:px-8 py-2.5 flex items-center justify-between z-40 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <JudiciaryLogo size="sm" variant="full" showText={true} lightMode={false} />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/25 text-[11px] sm:text-xs text-emerald-200">
            <span className={`w-2 h-2 rounded-full ${status === 'recording' ? 'bg-rose-500 animate-pulse' : 'bg-emerald-400'}`} />
            <span className="font-semibold tracking-wide uppercase text-[10px] sm:text-[11px]">
              {status === 'recording' ? 'Court Session Live' : 'Electronic Court Record'}
            </span>
          </div>

          <span className="text-[10px] font-bold text-emerald-300/80 uppercase tracking-widest hidden md:inline border-l border-emerald-700/50 pl-3">
            Federal Republic of Nigeria
          </span>
        </div>
      </header>

      {/* Main Responsive App Body: Fills the rest of the browser window smoothly */}
      <main className="flex-1 w-full max-w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto flex flex-col overflow-hidden relative bg-[#F8FAF9] sm:border-x sm:border-emerald-900/10 sm:shadow-lg">
        {/* Main Mobile/Desktop App Container */}
        <PhoneFrame theme={pageTheme}>
          {/* Content Body Area with fluid directional motion */}
          <div
            key={activePage}
            className={`flex-1 flex flex-col overflow-hidden relative ${
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
              onStartRecord={handleStartRecording}
            />
          )}

          {/* 2. Live Recording Page */}
          {activePage === 'live' && (
            <LiveRecordingView
              title={status === 'recording' ? 'Live Recording' : status === 'processing' ? 'Processing Recording' : 'Audio Stream'}
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
              onViewTranscript={() => navigateTo('transcript', 'forward')}
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
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-3 bg-[#F8FAFC]">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <FileText className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900">No Transcript Yet</h3>
                <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                  Record a meeting or select an existing session from Meetings to inspect its speaker-diarized transcript and playback.
                </p>
                <button
                  onClick={handleStartRecording}
                  className="px-4 py-2 rounded-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-semibold shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Start Recording</span>
                </button>
              </div>
            )
          )}

          {/* 4. Summary Page */}
          {activePage === 'summary' && (
            effectiveSession ? (
              <MeetingDetailView
                session={effectiveSession}
                initialTab="summary"
                onBack={() => navigateTo('meetings', 'backward')}
                onToggleActionItem={toggleActionItem}
                onExport={exportSession}
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
                  onClick={handleStartRecording}
                  className="px-4 py-2 rounded-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-semibold shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Start Recording</span>
                </button>
              </div>
            )
          )}

          {/* 5. Actions Page */}
          {activePage === 'actions' && (
            <GlobalActionsView
              sessions={sessions}
              onBack={() => navigateTo('meetings', 'backward')}
              onSelectMeeting={(session) => {
                setSelectedSession(session);
                navigateTo('transcript', 'forward');
              }}
            />
          )}
        </div>

        {/* Universal Floating Button Plate (Docked at bottom of ALL pages!) */}
        <ButtonPlate
          activePage={activePage}
          onNavigate={(page) => navigateTo(page)}
          hasSession={Boolean(effectiveSession)}
          actionCount={totalActionCount}
          theme={pageTheme}
        />
      </PhoneFrame>
    </main>
  </div>
);
};
