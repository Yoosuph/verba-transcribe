import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  Play,
  Pause,
  Download,
  CheckSquare,
  Square,
  Clock,
  Calendar,
  MapPin,
  Users,
  User,
  Copy,
  Check,
  Sparkles,
  ListChecks,
  FileText,
  Search,
  BadgeCheck,
  HelpCircle,
  MessageSquare,
  Lightbulb,
  Pencil,
} from 'lucide-react';
import type { SessionState } from '../../types/transcription';

interface MeetingDetailViewProps {
  session: SessionState;
  onBack: () => void;
  onToggleActionItem?: (actionId: string, completed: boolean) => void;
  onExport?: (format: 'markdown' | 'txt' | 'json') => void;
  onRenameSpeaker?: (oldName: string, newName: string) => void;
  initialTab?: 'summary' | 'transcript' | 'actions';
}

const formatTime = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
};

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const;

export const MeetingDetailView: React.FC<MeetingDetailViewProps> = ({
  session,
  onBack,
  onToggleActionItem,
  onExport,
  onRenameSpeaker,
  initialTab = 'summary',
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript' | 'actions'>(initialTab);
  const [exportOpen, setExportOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [actionItems, setActionItems] = useState(session.summary?.action_items || []);

  // Audio playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [audioDuration, setAudioDuration] = useState(session.duration_seconds || 0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [hasAudioError, setHasAudioError] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (session.summary?.action_items) {
      setActionItems(session.summary.action_items);
    }
  }, [session.summary?.action_items]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Pause audio when leaving the view
  useEffect(() => {
    const audioEl = audioRef.current;
    return () => {
      if (audioEl) audioEl.pause();
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setHasAudioError(true));
    }
  };

  const seekAudio = (time: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, time);
    setPlaybackSeconds(audioRef.current.currentTime);
  };

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const displayName = (speaker: string) => session.speaker_names?.[speaker] || speaker;

  const handleRename = (speaker: string) => {
    if (!onRenameSpeaker) return;
    const next = window.prompt(`Rename "${displayName(speaker)}" to:`, displayName(speaker));
    if (next && next.trim() && next.trim() !== displayName(speaker)) {
      onRenameSpeaker(speaker, next.trim());
    }
  };

  const info = session.meeting_info;
  const summary = session.summary;
  const segments = session.final_transcript?.segments || [];
  const filteredSegments = transcriptQuery.trim()
    ? segments.filter(
        (seg) =>
          seg.text.toLowerCase().includes(transcriptQuery.toLowerCase()) ||
          displayName(seg.speaker).toLowerCase().includes(transcriptQuery.toLowerCase())
      )
    : segments;

  const completedCount = actionItems.filter((a) => a.completed).length;
  const fullTranscriptText = segments
    .map((seg) => `${displayName(seg.speaker)}: ${seg.text}`)
    .join('\n\n');

  const hasAudio = Boolean(session.audio_url) && session.has_audio !== false && !hasAudioError;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F8FAF9] text-slate-900 overflow-hidden relative select-none">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 sm:px-6 pt-3 pb-3 border-b border-slate-200/80 flex-shrink-0 bg-white/90 backdrop-blur-sm">
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white hover:bg-slate-100 border border-slate-200/90 active:scale-[0.98] transition-all flex items-center justify-center text-slate-700 shadow-xs cursor-pointer flex-shrink-0"
            title="Back to all meetings"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#008751] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
              {info?.meeting_type || 'Meeting Record'}
            </span>
            <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-tight mt-0.5 truncate">
              {session.title || info?.title || 'Untitled Meeting'}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
              {info?.meeting_date && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" /> {info.meeting_date}
                </span>
              )}
              {info?.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400" /> {info.location}
                </span>
              )}
              {info?.organizer && (
                <span className="inline-flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" /> {info.organizer}
                </span>
              )}
              {(info?.participants?.length || 0) > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3 h-3 text-slate-400" /> {info!.participants.length} participants
                </span>
              )}
              <span className="inline-flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3 text-slate-400" /> {formatTime(session.duration_seconds || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Export menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setExportOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
            title="Export meeting record"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
              <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                {([
                  ['markdown', 'Markdown (.md)'],
                  ['txt', 'Plain text (.txt)'],
                  ['json', 'JSON (.json)'],
                ] as const).map(([fmt, label]) => (
                  <button
                    key={fmt}
                    onClick={() => {
                      setExportOpen(false);
                      onExport?.(fmt);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-[#008751] transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Audio player */}
      {hasAudio && (
        <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200/80 flex-shrink-0">
          <audio
            ref={audioRef}
            src={session.audio_url}
            preload="metadata"
            onTimeUpdate={(e) => setPlaybackSeconds(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => {
              if (Number.isFinite(e.currentTarget.duration)) {
                setAudioDuration(e.currentTarget.duration);
              }
            }}
            onEnded={() => setIsPlaying(false)}
            onError={() => setHasAudioError(true)}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-[#008751] hover:bg-[#007043] text-white flex items-center justify-center flex-shrink-0 shadow-xs active:scale-95 transition-all cursor-pointer"
              title={isPlaying ? 'Pause playback' : 'Play recording'}
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(1, audioDuration)}
              value={Math.min(playbackSeconds, audioDuration || 0)}
              onChange={(e) => seekAudio(Number(e.target.value))}
              className="flex-1 accent-[#008751] cursor-pointer"
              aria-label="Seek audio"
            />
            <span className="text-[11px] font-mono text-slate-500 flex-shrink-0">
              {formatTime(playbackSeconds)} / {formatTime(audioDuration)}
            </span>
            <button
              onClick={() =>
                setPlaybackSpeed(
                  PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(playbackSpeed as any) + 1) % PLAYBACK_SPEEDS.length]
                )
              }
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 cursor-pointer active:scale-95 transition-all flex-shrink-0"
              title="Cycle playback speed"
            >
              {playbackSpeed}x
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 sm:px-6 pt-3 flex-shrink-0">
        <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80">
          {([
            ['summary', 'Summary', Sparkles],
            ['transcript', 'Transcript', FileText],
            ['actions', `Actions${actionItems.length ? ` (${actionItems.length})` : ''}`, ListChecks],
          ] as const).map(([tab, label, Icon]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              aria-current={activeTab === tab ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === tab
                  ? 'bg-white text-[#008751] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 pb-28 space-y-4">
        {/* ================= TAB: SUMMARY ================= */}
        {activeTab === 'summary' && (
          <div className="space-y-4 max-w-3xl">
            {summary ? (
              <>
                <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#008751]" /> Executive Summary
                    </h2>
                    <button
                      onClick={() => copyToClipboard(summary.executive_summary)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[#008751] cursor-pointer"
                      title="Copy summary"
                    >
                      {copySuccess ? <Check className="w-3.5 h-3.5 text-[#008751]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{summary.executive_summary}</p>
                </section>

                {summary.key_points.length > 0 && (
                  <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <Lightbulb className="w-4 h-4 text-[#008751]" /> Key Points
                    </h2>
                    <ul className="space-y-2">
                      {summary.key_points.map((kp, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-slate-700 leading-relaxed">
                          <span className="mt-0.5 w-4 h-4 rounded-full bg-emerald-50 text-[#008751] text-[9px] font-black flex items-center justify-center flex-shrink-0 border border-emerald-200/60">
                            {i + 1}
                          </span>
                          {kp}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {summary.decisions.length > 0 && (
                  <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <BadgeCheck className="w-4 h-4 text-[#008751]" /> Decisions Made
                    </h2>
                    <div className="space-y-2">
                      {summary.decisions.map((d, i) => (
                        <div key={d.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs sm:text-sm text-slate-800 leading-relaxed">
                          <span className="font-bold text-[#008751] mr-1.5">{i + 1}.</span>
                          {d.decision}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {summary.questions.length > 0 && (
                  <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <HelpCircle className="w-4 h-4 text-[#008751]" /> Open Questions
                    </h2>
                    <ul className="space-y-2">
                      {summary.questions.map((q, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-slate-700 leading-relaxed">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                          {q}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {summary.speaker_contributions.length > 0 && (
                  <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-[#008751]" /> Speaker Contributions
                    </h2>
                    <div className="space-y-3">
                      {summary.speaker_contributions.map((sc, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#008751] text-xs font-bold flex items-center justify-center flex-shrink-0 border border-emerald-200/60">
                            {(displayName(sc.speaker) || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900">{displayName(sc.speaker)}</div>
                            <p className="text-xs text-slate-600 leading-relaxed">{sc.summary}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center">
                <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">No summary yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  The summary is generated automatically after the recording is finalized.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB: TRANSCRIPT ================= */}
        {activeTab === 'transcript' && (
          <div className="space-y-4 max-w-3xl">
            {segments.length > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-xs">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={transcriptQuery}
                      onChange={(e) => setTranscriptQuery(e.target.value)}
                      placeholder="Search transcript..."
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#008751]/30"
                    />
                  </div>
                  <button
                    onClick={() => copyToClipboard(fullTranscriptText)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 cursor-pointer active:scale-95 transition-all"
                  >
                    {copySuccess ? <Check className="w-3.5 h-3.5 text-[#008751]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">Copy all</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {filteredSegments.map((seg) => (
                    <article
                      key={seg.id}
                      id={seg.id}
                      className="p-3.5 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-slate-900">{displayName(seg.speaker)}</span>
                          {onRenameSpeaker && (
                            <button
                              onClick={() => handleRename(seg.speaker)}
                              className="text-slate-400 hover:text-[#008751] cursor-pointer"
                              title="Rename speaker"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {hasAudio && (
                          <button
                            onClick={() => {
                              seekAudio(seg.start);
                              if (!isPlaying) togglePlay();
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-[#008751] bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded cursor-pointer active:scale-95 transition-all"
                            title={`Play from ${formatTime(seg.start)}`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            {formatTime(seg.start)}
                          </button>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">{seg.text}</p>
                    </article>
                  ))}
                  {filteredSegments.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-6">No segments match “{transcriptQuery}”.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">No transcript available</p>
                <p className="text-xs text-slate-500 mt-1">
                  {session.live_transcript.length > 0
                    ? 'The finalized transcript will appear here after processing completes.'
                    : 'Record a meeting to generate a transcript.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB: ACTIONS ================= */}
        {activeTab === 'actions' && (
          <div className="space-y-4 max-w-3xl">
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-[#008751]" /> Action Items
                </h2>
                {actionItems.length > 0 && (
                  <span className="text-[11px] font-bold text-slate-500">
                    {completedCount}/{actionItems.length} done
                  </span>
                )}
              </div>

              {actionItems.length > 0 ? (
                <div className="space-y-2">
                  {actionItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleLocalAction(item.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                        item.completed
                          ? 'bg-emerald-50/50 border-emerald-200/70'
                          : 'bg-white border-slate-200/90 hover:border-slate-300'
                      }`}
                    >
                      {item.completed ? (
                        <CheckSquare className="w-4 h-4 text-[#008751] mt-0.5 flex-shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs sm:text-sm leading-relaxed ${
                            item.completed ? 'text-slate-400 line-through' : 'text-slate-800'
                          }`}
                        >
                          {item.task}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-slate-500">
                          {item.assignee && (
                            <span className="inline-flex items-center gap-1">
                              <User className="w-3 h-3" /> {item.assignee}
                            </span>
                          )}
                          {item.deadline && (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {item.deadline}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <CheckSquare className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 mt-1">
                    No action items were detected in this meeting.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

