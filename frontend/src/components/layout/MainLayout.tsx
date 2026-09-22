import React, { useState, useEffect, useRef } from 'react';
import { PhoneFrame } from '../phone/PhoneFrame';
import { ButtonPlate } from './ButtonPlate';

import { MeetingsListView } from '../views/MeetingsListView';
import { LiveRecordingView } from '../views/LiveRecordingView';
import { MeetingDetailView } from '../views/MeetingDetailView';
import { GlobalActionsView } from '../views/GlobalActionsView';
import { useRecordingSession } from '../../hooks/useRecordingSession';
import { usePageNavigation } from '../../hooks/usePageNavigation';
import { useMeetingsStore } from '../../hooks/useMeetingsStore';
import type { LanguageMode, MeetingSummary } from '../../types/transcription';
import type { SessionPatch } from '../../services/api';
import { isShareMode } from '../../services/auth';
import { deriveTitleFromSummary, defaultMeetingTitle } from '../../utils/title';
import { Plus, AlertTriangle, FileText, Eye, X } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';

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
  } = useRecordingSession();

  const {
    sessions,
    selectedSession,
    setSelectedSession,
    effectiveSession,
    upsertSession,
    renameSession,
    removeSession,
    refreshSessions,
    loadSessionById,
  } = useMeetingsStore();

  const { activePage, navDirection, navigateTo, hashSessionId } = usePageNavigation();

  // Share links (?share=token#/transcript/<id>) are read-only, scoped views.
  const readOnly = isShareMode();

  // Deep link: honour #/transcript/<id> by selecting that meeting once loaded
  useEffect(() => {
    if (!hashSessionId || selectedSession) return;
    const match = sessions.find((s) => s.id === hashSessionId);
    if (match) setSelectedSession(match);
  }, [hashSessionId, sessions, selectedSession, setSelectedSession]);

  // Share mode: the list endpoint is out of scope, so load the shared session
  // directly by its hash id (the share token authorizes that single GET).
  useEffect(() => {
    if (!readOnly || !hashSessionId) return;
    if (selectedSession?.id === hashSessionId) return;
    void loadSessionById(hashSessionId);
  }, [readOnly, hashSessionId, selectedSession, loadSessionById]);

  // Guards starting a new recording while one is in flight
  const [confirmNewMeetingWhileActive, setConfirmNewMeetingWhileActive] = useState(false);
  /** New-meeting setup: optional title / agenda / template before recording. */
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupTitle, setSetupTitle] = useState('');
  const [setupAgenda, setSetupAgenda] = useState('');
  const [setupTemplate, setSetupTemplate] = useState('');
  const [setupLang, setSetupLang] = useState<LanguageMode>('auto');
  /** Stable per-session title/time so repeated sync upserts don't shift them. */
  const sessionMetaRef = useRef<{ id: string; title: string; startedAt: string } | null>(null);
  /** Ensures we navigate to meetings exactly once per processing session. */
  const processingNavRef = useRef<string | null>(null);

  // When recording status becomes 'recording', navigate to 'live'
  useEffect(() => {
    if (status === 'recording') {
      sessionMetaRef.current = null;
      processingNavRef.current = null;
      navigateTo('live', 'up');
    }
  }, [status, navigateTo]);

  // There is no processing page: on stop, return to the meetings list.
  // Processing continues server-side; the list row shows live progress.
  useEffect(() => {
    if (status !== 'processing' || !sessionId) return;
    if (processingNavRef.current === sessionId) return;
    processingNavRef.current = sessionId;
    navigateTo('meetings', 'backward');
  }, [status, sessionId, navigateTo]);

  // Keep the library in sync WHILE processing/complete (not only once at the
  // end) so the meetings list, detail view, and late-arriving summaries all
  // update live — no browser refresh required.
  useEffect(() => {
    if (!sessionId || (status !== 'processing' && status !== 'complete')) return;

    if (!sessionMetaRef.current || sessionMetaRef.current.id !== sessionId) {
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      sessionMetaRef.current = {
        id: sessionId,
        title: defaultMeetingTitle(),
        startedAt: `Today at ${timeStr}`,
      };
    }
    const meta = sessionMetaRef.current;

    const finalSessionSummary: MeetingSummary | undefined =
      summary ??
      (status === 'complete'
        ? {
            executive_summary:
              liveTranscript.length > 0
                ? liveTranscript.map((t) => t.text).join(' ')
                : 'Audio recording captured and processed.',
            key_points: ['Session recorded and transcribed successfully.'],
            decisions: [],
            action_items: [],
            questions: [],
            speaker_contributions: [],
          }
        : undefined);

    const derivedTitle = deriveTitleFromSummary(finalSessionSummary);

    upsertSession({
      id: sessionId,
      title: derivedTitle || meta.title,
      status,
      started_at: meta.startedAt,
      duration_seconds: recordingSeconds || 1,
      language_mode: languageMode,
      live_transcript: liveTranscript,
      final_transcript: finalTranscript || undefined,
      summary: finalSessionSummary,
      speaker_names: {},
    });
  }, [
    status,
    sessionId,
    summary,
    liveTranscript,
    finalTranscript,
    recordingSeconds,
    languageMode,
    upsertSession,
  ]);

  // Once complete, re-pull the backend copy so audio_url / has_audio and any
  // server-side fields land immediately (they previously required a reload).
  useEffect(() => {
    if (status !== 'complete' || !sessionId) return;
    refreshSessions();
    const retry = window.setTimeout(refreshSessions, 1500);
    return () => window.clearTimeout(retry);
  }, [status, sessionId, refreshSessions]);

  // Opening the "New Meeting" modal while a session is live must not silently
  // kill the recording. Route through a confirmation that keeps the mic streaming
  // until the user explicitly chooses to stop.
  const handleRequestNewMeeting = () => {
    if (readOnly) return;
    if (status === 'recording' || status === 'processing') {
      setConfirmNewMeetingWhileActive(true);
      return;
    }
    setSetupLang(languageMode);
    setSetupTitle('');
    setSetupAgenda('');
    setSetupTemplate('');
    setSetupOpen(true);
  };

  /** Starts recording with (optional) title/agenda/template applied first. */
  const confirmNewMeeting = (withMeta: boolean) => {
    setSetupOpen(false);
    const meta: SessionPatch = {};
    if (withMeta) {
      if (setupTitle.trim()) meta.title = setupTitle.trim();
      if (setupAgenda.trim()) meta.agenda = setupAgenda.trim();
      if (setupTemplate) meta.template = setupTemplate;
    }
    void startSession(setupLang, Object.keys(meta).length > 0 ? meta : undefined);
    setSetupTitle('');
    setSetupAgenda('');
    setSetupTemplate('');
  };

  const handleStopRecording = () => {
    stopSession();
  };

  const handleSelectMeeting = (session: typeof sessions[number]) => {
    setSelectedSession(session);
    navigateTo('transcript', 'forward', session.id);
  };

  /** Selects a session by id (if known) and opens its record page. */
  const openMeetingById = (id?: string | null) => {
    if (id) {
      const match = sessions.find((s) => s.id === id);
      if (match) setSelectedSession(match);
      navigateTo('transcript', 'forward', id);
    } else {
      navigateTo('transcript', 'forward', undefined);
    }
  };

  // Determine theme for current page
  const pageTheme = activePage === 'live' && status === 'recording' ? 'royal' : 'light';

  return (
    <div className="fixed inset-0 w-full h-full bg-[#F4F7F5] text-slate-900 flex flex-col overflow-hidden select-none selection:bg-[#008751]/30 font-sans">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-xs focus:font-bold focus:shadow-lg">
        Skip to content
      </a>
      {/* Subtle brand accent ribbon */}
      <div className="w-full h-1 bg-gradient-to-r from-emerald-600 via-[#008751] to-emerald-800 flex-shrink-0 z-50 no-print" />

      {/* Main Responsive App Body */}
      <main id="main-content" className="flex-1 min-h-0 w-full max-w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto flex flex-col overflow-hidden relative bg-[#F8FAF9] sm:border-x sm:border-emerald-900/10 sm:shadow-lg">
        {/* Floating Minimal Header Bar */}
        {activePage !== 'live' && (
          <div className="absolute top-2.5 left-3 right-3 sm:left-6 sm:right-6 z-40 no-print flex justify-center pointer-events-none">
            <header className="pointer-events-auto w-full max-w-4xl bg-white/92 hover:bg-white backdrop-blur-md border border-slate-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.06)] rounded-2xl px-3 sm:px-4 py-2 flex items-center justify-between transition-all">
              {/* Left: Emblem & App Title (acts as Home) */}
              <div
                onClick={() => navigateTo('meetings', 'backward')}
                className="flex items-center gap-2.5 cursor-pointer active:scale-95 transition-all"
                title="Go to all meetings"
              >
                <BrandLogo size="sm" variant="full" lightMode={true} />
              </div>
              {/* Right: current section label so users always know where they are */}
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                {activePage === 'meetings'
                  ? 'All Meetings'
                  : activePage === 'transcript'
                  ? 'Meeting Record'
                  : activePage === 'actions'
                  ? 'Actions'
                  : ''}
              </span>
            </header>
          </div>
        )}

        {/* View-only banner for shared read-only links */}
        {readOnly && activePage !== 'live' && (
          <div className="absolute top-[62px] left-3 right-3 sm:left-6 sm:right-6 z-30 no-print flex justify-center pointer-events-none">
            <div className="pointer-events-auto w-full max-w-4xl bg-amber-50/95 backdrop-blur border border-amber-200 shadow-sm rounded-xl px-3 py-1.5 flex items-center gap-2 text-amber-800">
              <Eye className="w-3.5 h-3.5 flex-shrink-0" />
              <p className="text-[11px] font-bold leading-snug">
                View-only shared link — editing, recording and sharing are disabled.
              </p>
            </div>
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
                onStartRecord={() => handleRequestNewMeeting()}
                onRenameMeeting={renameSession}
                onDeleteMeeting={removeSession}
                onSessionUpsert={upsertSession}
                onRefresh={refreshSessions}
                readOnly={readOnly}
              />
            )}

            {/* 2. Live Recording Page */}
            {activePage === 'live' && (
              <LiveRecordingView
                title={
                  status === 'recording'
                    ? 'Live Meeting Recording'
                    : status === 'processing'
                    ? 'Processing Recording'
                    : status === 'complete'
                    ? 'Meeting Complete'
                    : 'Audio Stream'
                }
                recordingSeconds={recordingSeconds}
                liveTranscript={liveTranscript}
                interimText={interimText}
                analyserNode={analyserNode}
                isPaused={isPaused}
                isProcessing={status === 'processing'}
                isComplete={status === 'complete'}
                summary={summary}
                processingStage={processingStage}
                errorMessage={errorMessage}
                onPause={pauseRecording}
                onResume={resumeRecording}
                onMinimize={() => navigateTo('meetings', 'backward')}
                onStop={handleStopRecording}
                onOpenRecord={() => openMeetingById(sessionId)}
                onStartRecord={() => handleRequestNewMeeting()}
                languageMode={languageMode}
              />
            )}

            {/* 3. Transcript Page */}
            {activePage === 'transcript' &&
              (effectiveSession ? (
                <MeetingDetailView
                  session={effectiveSession}
                  initialTab="summary"
                  onBack={() => navigateTo('meetings', 'backward')}
                  onSessionUpdated={upsertSession}
                  readOnly={readOnly}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 space-y-3 bg-[#F8FAFC]">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <FileText className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">No Transcript Yet</h3>
                  <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                    Record a meeting or select an existing session to inspect its speaker-diarized transcript and playback.
                  </p>
                  <button
                    onClick={() => handleRequestNewMeeting()}
                    className="px-4 py-2 rounded-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-semibold shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Meeting</span>
                  </button>
                </div>
              ))}

            {/* 4. Actions Page */}
            {activePage === 'actions' && (
              <GlobalActionsView
                sessions={sessions}
                onBack={() => navigateTo('meetings', 'backward')}
                onSelectMeeting={(session) => {
                  setSelectedSession(session);
                  navigateTo('transcript', 'forward', session.id);
                }}
                onStartRecord={() => handleRequestNewMeeting()}
              />
            )}
          </div>

          {/* Floating record button — labeled pill, docked above the button plate */}
          {activePage !== 'live' &&
            status !== 'recording' &&
            status !== 'processing' &&
            !readOnly && (
              <button
                onClick={() => handleRequestNewMeeting()}
                aria-label="Record a new meeting"
                title="Start recording a new meeting"
                className="absolute right-4 bottom-[96px] z-40 h-14 px-5 rounded-full bg-[#008751] hover:bg-[#007043] text-white shadow-[0_8px_24px_rgba(0,135,81,0.35)] active:scale-95 transition-all cursor-pointer flex items-center gap-2 border border-emerald-400/40 no-print"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="w-5 h-5"
                  aria-hidden="true"
                >
                  <line x1="4" y1="10" x2="4" y2="14" />
                  <line x1="8" y1="7" x2="8" y2="17" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                  <line x1="16" y1="7" x2="16" y2="17" />
                  <line x1="20" y1="10" x2="20" y2="14" />
                </svg>
                <span className="text-sm font-black tracking-tight">Record</span>
              </button>
            )}

          {/* Universal Floating Button Plate (Docked at bottom of ALL pages) */}
          <ButtonPlate
            activePage={activePage}
            onNavigate={(page) => {
              // There is no processing page — during finalization, route to the
              // in-flight meeting's record view instead of the removed live screen.
              if (page === 'live' && status === 'processing') {
                if (sessionId) openMeetingById(sessionId);
                else navigateTo('meetings', 'backward');
                return;
              }
              navigateTo(page);
            }}
            hasSession={Boolean(effectiveSession)}
            theme={pageTheme}
            isRecording={status === 'recording'}
            isProcessing={status === 'processing'}
          />
        </PhoneFrame>
      </main>

      {/* Guard: opening setup while a session is live must be explicit */}
      {confirmNewMeetingWhileActive && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">A session is active</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Starting a new meeting will stop the current recording. You can also just view it from the Meetings list.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setConfirmNewMeetingWhileActive(false);
                  stopSession();
                  setTimeout(() => startSession(languageMode), 200);
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold active:scale-[0.99] transition-all cursor-pointer"
              >
                Stop current session &amp; start new
              </button>
              <button
                onClick={() => {
                  setConfirmNewMeetingWhileActive(false);
                  navigateTo('meetings', 'backward');
                }}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold active:scale-[0.99] transition-all cursor-pointer"
              >
                View Meetings instead
              </button>
              <button
                onClick={() => setConfirmNewMeetingWhileActive(false)}
                className="w-full px-4 py-2 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-semibold active:scale-[0.99] transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New meeting setup: language + optional title / agenda / template */}
      {setupOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">New Meeting</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Optionally set an agenda or template — the summarizer will follow it.
                </p>
              </div>
              <button
                onClick={() => setSetupOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setup-lang" className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Language
              </label>
              <div id="setup-lang" className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80">
                {(
                  [
                    ['auto', 'Auto'],
                    ['en', 'English'],
                    ['ha', 'Hausa'],
                  ] as const
                ).map(([lang, label]) => (
                  <button
                    key={lang}
                    onClick={() => setSetupLang(lang)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      setupLang === lang ? 'bg-white text-[#008751] shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setup-title" className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Title (optional)
              </label>
              <input
                id="setup-title"
                value={setupTitle}
                onChange={(e) => setSetupTitle(e.target.value)}
                maxLength={200}
                placeholder="e.g. Weekly budget review"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setup-template" className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Template (optional)
              </label>
              <select
                id="setup-template"
                value={setupTemplate}
                onChange={(e) => setSetupTemplate(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751]"
              >
                <option value="">General meeting</option>
                <option value="standup">Standup</option>
                <option value="interview">Interview</option>
                <option value="lecture">Lecture</option>
                <option value="board">Board meeting</option>
                <option value="hearing">Court hearing</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setup-agenda" className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Agenda (optional)
              </label>
              <textarea
                id="setup-agenda"
                value={setupAgenda}
                onChange={(e) => setSetupAgenda(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder={'1. Budget update\n2. Staffing\n3. AOB'}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 focus:border-[#008751] resize-y"
              />
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => confirmNewMeeting(true)}
                className="w-full px-4 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold active:scale-[0.99] transition-all cursor-pointer"
              >
                Start recording
              </button>
              <button
                onClick={() => confirmNewMeeting(false)}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold active:scale-[0.99] transition-all cursor-pointer"
              >
                Quick start (no setup)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
