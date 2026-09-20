import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Share2,
  MoreHorizontal,
  Check,
  Copy,

  Play,
  Pause,
  FileCheck,
} from 'lucide-react';
import type { SessionState, ActionItem } from '../../types/transcription';

interface MeetingDetailViewProps {
  session: SessionState;
  onBack: () => void;
  onToggleActionItem?: (actionId: string, completed: boolean) => void;
  onExport?: (format: 'markdown' | 'txt' | 'json') => void;
  initialTab?: 'summary' | 'transcript' | 'actions';
}

export const MeetingDetailView: React.FC<MeetingDetailViewProps> = ({
  session,
  onBack,
  onToggleActionItem,
  onExport,
  initialTab = 'summary',
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript' | 'actions'>(initialTab);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
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
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play()
        .then(() => {
          setIsPlayingAudio(true);
          setHasAudioError(false);
        })
        .catch((err) => {
          console.warn("Real audio playback unavailable, falling back to preview ticker:", err);
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
        audioRef.current.play()
          .then(() => {
            setIsPlayingAudio(true);
            setHasAudioError(false);
          })
          .catch(() => {});
      }
    }
  };

  const handleSpeedChange = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(next);
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

  const speakerColors = [
    { dot: 'bg-[#3B82F6]', text: 'text-[#3B82F6]', bg: 'bg-[#3B82F6]' },
    { dot: 'bg-[#F97316]', text: 'text-[#EA580C]', bg: 'bg-[#F97316]' },
    { dot: 'bg-[#10B981]', text: 'text-[#059669]', bg: 'bg-[#10B981]' },
    { dot: 'bg-[#D97706]', text: 'text-[#D97706]', bg: 'bg-[#D97706]' },
    { dot: 'bg-[#8B5CF6]', text: 'text-[#7C3AED]', bg: 'bg-[#8B5CF6]' },
  ];

  const getSpeakerStyle = (speaker: string) => {
    const idx = detectedSpeakers.indexOf(speaker);
    return speakerColors[idx >= 0 ? idx % speakerColors.length : 0];
  };

  const handleCopySummary = () => {
    const text = `${session.title || 'Meeting Summary'}\n\nOverview:\n${
      session.summary?.executive_summary || 'No summary available.'
    }\n\nDecisions:\n${
      session.summary?.decisions?.map((d) => `- ${d.decision}`).join('\n') || 'None recorded'
    }\n\nAction Items:\n${
      actionItems.map((a) => `- [${a.completed ? 'x' : ' '}] ${a.task} (${a.assignee || 'Unassigned'})`).join('\n') || 'None recorded'
    }`;
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Multi-color spectrum waveform bars
  const waveformColors = [
    '#3B82F6', '#2563EB', '#F97316', '#EA580C', '#10B981', '#059669',
    '#06B6D4', '#0891B2', '#F43F5E', '#E11D48', '#8B5CF6', '#7C3AED',
    '#F59E0B', '#D97706', '#14B8A6', '#0D9488', '#6366F1', '#4F46E5',
    '#EC4899', '#DB2777', '#3B82F6', '#2563EB', '#F97316', '#EA580C',
    '#10B981', '#059669', '#06B6D4', '#0891B2', '#F43F5E', '#E11D48',
  ];

  const segments = session.final_transcript?.segments || [];
  const filteredSegments = activeSpeakerFilter
    ? segments.filter((s) => s.speaker === activeSpeakerFilter)
    : segments;

  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFC] text-slate-900 overflow-hidden relative select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-5 pt-3 pb-2 flex-shrink-0">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center text-slate-700"
          title="Back to Meetings"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <h2 className="text-base font-bold text-slate-900 truncate max-w-[180px]">
          {activeTab === 'transcript'
            ? 'Transcript'
            : activeTab === 'actions'
            ? 'Action Items'
            : 'Meeting Notes'}
        </h2>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onExport && onExport('markdown')}
            className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center text-slate-700"
            title="Export / Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center text-slate-700">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Meeting Header Block */}
      <div className="px-5 pt-1 pb-3 flex-shrink-0">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ECEFFE] text-[#3B4BEA] text-xs font-semibold mb-2">
          <FileCheck className="w-3.5 h-3.5" />
          <span>Finalized & Diarized</span>
        </div>

        <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-snug truncate">
          {session.title || 'Meeting Session'}
        </h1>

        <div className="flex items-center justify-between mt-1">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <span>{session.started_at || 'Today'}</span>
            <span>·</span>
            <span className="font-mono">{formatPlaybackTime(totalDuration)}</span>
          </span>

          <div className="flex items-center gap-2">
            {/* Quick Replay Pill */}
            <button
              onClick={togglePlay}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all active:scale-95 shadow-xs cursor-pointer ${
                isPlayingAudio
                  ? 'bg-[#2F45EE] text-white shadow-indigo-500/20'
                  : 'bg-white border border-slate-200/80 text-[#2F45EE] hover:bg-slate-50'
              }`}
              title={isPlayingAudio ? 'Pause meeting audio' : 'Replay meeting audio'}
            >
              {isPlayingAudio ? (
                <>
                  <Pause className="w-3 h-3 fill-white" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current ml-0.5" />
                  <span>Replay</span>
                </>
              )}
            </button>

            {detectedSpeakers.length > 0 && (
              <div className="flex items-center">
                {detectedSpeakers.slice(0, 4).map((sp, idx) => (
                  <div
                    key={idx}
                    title={sp}
                    className={`w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white ${
                      speakerColors[idx % speakerColors.length].bg
                    } ${idx > 0 ? '-ml-1.5' : ''}`}
                  >
                    {sp ? sp[0].toUpperCase() : 'S'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Segmented Tab Navigation Control */}
      <div className="px-5 pb-3 flex-shrink-0">
        <div className="flex bg-slate-200/70 p-1 rounded-xl text-xs relative select-none">
          {/* Animated Sliding Active Pill */}
          <div
            className="absolute top-1 bottom-1 rounded-lg bg-white shadow-sm transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none"
            style={{
              width: 'calc((100% - 8px) / 3)',
              left: '4px',
              transform: `translateX(${
                activeTab === 'summary'
                  ? '0%'
                  : activeTab === 'transcript'
                  ? 'calc(100% + 2px)'
                  : 'calc(200% + 4px)'
              })`,
            }}
          />

          <button
            onClick={() => setActiveTab('summary')}
            className={`relative z-10 flex-1 py-1.5 rounded-lg text-center transition-colors duration-150 ${
              activeTab === 'summary'
                ? 'text-slate-900 font-bold'
                : 'text-slate-500 hover:text-slate-800 font-medium'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab('transcript')}
            className={`relative z-10 flex-1 py-1.5 rounded-lg text-center transition-colors duration-150 ${
              activeTab === 'transcript'
                ? 'text-slate-900 font-bold'
                : 'text-slate-500 hover:text-slate-800 font-medium'
            }`}
          >
            Transcript
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={`relative z-10 flex-1 py-1.5 rounded-lg text-center transition-colors duration-150 ${
              activeTab === 'actions'
                ? 'text-slate-900 font-bold'
                : 'text-slate-500 hover:text-slate-800 font-medium'
            }`}
          >
            Actions {actionItems.length > 0 ? `(${actionItems.length})` : ''}
          </button>
        </div>
      </div>

      {/* Scrollable Main Content with fluid fade motion */}
      <div key={activeTab} className="flex-1 overflow-y-auto px-5 pb-24 space-y-4 page-enter-fade">
        {/* ================= TAB 1: SUMMARY ================= */}
        {activeTab === 'summary' && (
          <div className="space-y-5">
            {/* Overview */}
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-2">
                Overview
              </h2>
              {session.summary?.executive_summary ? (
                <p className="text-sm text-slate-600 leading-relaxed font-normal">
                  {session.summary.executive_summary}
                </p>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  Summary processing or not available.
                </p>
              )}
            </div>

            {/* Decisions */}
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-2.5">
                Decisions
              </h2>
              {session.summary?.decisions && session.summary.decisions.length > 0 ? (
                <div className="space-y-2">
                  {session.summary.decisions.map((dec, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-sm text-slate-800">
                      <div className="w-4 h-4 rounded-full bg-[#EEF2FF] text-[#2F45EE] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      </div>
                      <span className="font-normal leading-snug">{dec.decision}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  No specific decisions were identified in this session.
                </p>
              )}
            </div>

            {/* Action Items Preview */}
            <div>
              <h2 className="text-base font-bold text-slate-900 mb-2.5">
                Action items
              </h2>
              {actionItems.length > 0 ? (
                <div className="space-y-2">
                  {actionItems.map((act) => {
                    const initial = act.assignee ? act.assignee[0].toUpperCase() : 'U';

                    return (
                      <div
                        key={act.id}
                        onClick={() => toggleLocalAction(act.id)}
                        className="bg-white rounded-xl p-3 border border-slate-100 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:border-slate-200 transition-all touch-press"
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                              act.completed
                                ? 'bg-[#10B981] text-white shadow-xs'
                                : 'border-2 border-slate-300 bg-white'
                            }`}
                          >
                            {act.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </button>
                          <span
                            className={`text-sm font-medium ${
                              act.completed
                                ? 'text-slate-400 line-through'
                                : 'text-slate-800'
                            }`}
                          >
                            {act.task}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {act.deadline && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                                act.completed
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {act.deadline}
                            </span>
                          )}
                          <div className="w-6 h-6 rounded-full bg-[#2F45EE] text-white text-[10px] font-bold flex items-center justify-center">
                            {initial}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  No action items identified for this session.
                </p>
              )}
            </div>

            {/* Inline Share & Copy Buttons */}
            <div className="pt-3 flex items-center gap-3">
              <button
                onClick={() => onExport && onExport('markdown')}
                className="flex-1 bg-[#2F45EE] hover:bg-[#2537D8] text-white py-3 px-4 rounded-2xl font-semibold text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 touch-press cursor-pointer transition-all active:scale-98"
              >
                <Share2 className="w-4 h-4" />
                <span>Share Summary</span>
              </button>
              <button
                onClick={handleCopySummary}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 py-3 px-5 rounded-2xl font-semibold text-xs flex items-center justify-center gap-2 touch-press cursor-pointer transition-all active:scale-98"
              >
                <Copy className="w-4 h-4 text-slate-600" />
                <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= TAB 2: TRANSCRIPT ================= */}
        {activeTab === 'transcript' && (
          <div className="space-y-4">
            {/* Audio Waveform Player Card */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_2px_10px_rgba(0,0,0,0.03)] space-y-3">
              <div className="flex items-center gap-3.5">
                <button
                  onClick={togglePlay}
                  className="w-12 h-12 rounded-full bg-[#2F45EE] hover:bg-[#2537D8] text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
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
                  className="flex-1 flex items-center justify-between gap-[2px] h-9 px-1 cursor-pointer py-1 group select-none"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    seekToTime(clickRatio * totalDuration);
                  }}
                  title="Click to scrub / seek audio"
                >
                  {waveformColors.map((color, idx) => {
                    const heightPercent = 25 + Math.sin(idx * 0.7 + (isPlayingAudio ? (playbackSeconds * 5) : 0)) * 55;
                    const isActive = idx < ((playbackSeconds / totalDuration) * waveformColors.length);

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

              {/* Time Indicators + Speed Pill */}
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono pt-1">
                <span className={isPlayingAudio ? 'text-[#2F45EE] font-semibold' : ''}>
                  {formatPlaybackTime(playbackSeconds)}
                </span>
                <button
                  onClick={handleSpeedChange}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-0.5 rounded-md text-[11px] font-sans active:scale-95 transition-all cursor-pointer"
                  title="Playback Speed"
                >
                  {playbackSpeed}×
                </button>
                <span>{formatPlaybackTime(totalDuration)}</span>
              </div>
            </div>

            {/* Speaker Filter Legend */}
            {detectedSpeakers.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-semibold text-slate-600 no-scrollbar">
                {detectedSpeakers.map((sp) => {
                  const style = getSpeakerStyle(sp);
                  const isSelected = activeSpeakerFilter === sp;

                  return (
                    <button
                      key={sp}
                      onClick={() =>
                        setActiveSpeakerFilter(isSelected ? null : sp)
                      }
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full transition-all whitespace-nowrap ${
                        isSelected
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-white border border-slate-200/80 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                      <span>{sp}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Diarized Transcript Entries */}
            <div className="space-y-3 pt-1">
              {filteredSegments.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  {session.live_transcript && session.live_transcript.length > 0 ? (
                    <div className="space-y-2 text-left">
                      {session.live_transcript.map((item, idx) => (
                        <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100">
                          <span className="text-xs font-bold text-[#2F45EE] block mb-1">
                            {item.speaker_label || 'Speaker'}
                          </span>
                          <p className="text-sm text-slate-800">{item.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    'No transcript segments recorded for this session.'
                  )}
                </div>
              ) : (
                filteredSegments.map((seg) => {
                  const style = getSpeakerStyle(seg.speaker);
                  const initial = seg.speaker ? seg.speaker[0].toUpperCase() : 'S';
                  const isActiveSegment = isPlayingAudio && playbackSeconds >= seg.start && playbackSeconds <= (seg.end || seg.start + 3);

                  return (
                    <div
                      key={seg.id}
                      className={`rounded-2xl p-3.5 border transition-all flex items-start gap-3 ${
                        isActiveSegment
                          ? 'bg-indigo-50/40 border-[#2F45EE]/40 shadow-sm ring-1 ring-[#2F45EE]/20'
                          : 'bg-white border-slate-100/90 shadow-xs hover:border-indigo-100'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 ${style.bg}`}
                      >
                        {initial}
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${style.text}`}>
                            {seg.speaker}
                          </span>
                          <button
                            onClick={() => seekToTime(seg.start)}
                            className="text-xs text-slate-400 hover:text-[#2F45EE] font-mono cursor-pointer flex items-center gap-1 transition-colors"
                            title={`Jump audio to ${formatPlaybackTime(seg.start)}`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current opacity-70" />
                            <span>{formatPlaybackTime(seg.start)}</span>
                          </button>
                        </div>
                        <p className="text-sm text-slate-800 leading-relaxed font-normal">
                          {seg.text}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: ACTIONS ================= */}
        {activeTab === 'actions' && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              Meeting Action Items ({actionItems.length})
            </h2>
            {actionItems.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4">
                No action items identified in this session.
              </p>
            ) : (
              <div className="space-y-2">
                {actionItems.map((act) => (
                  <div
                    key={act.id}
                    onClick={() => toggleLocalAction(act.id)}
                    className="bg-white rounded-xl p-3.5 border border-slate-100 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:border-slate-200 transition-all touch-press"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                          act.completed
                            ? 'bg-[#10B981] text-white shadow-xs'
                            : 'border-2 border-slate-300 bg-white'
                        }`}
                      >
                        {act.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                      <div>
                        <p
                          className={`text-sm font-medium ${
                            act.completed ? 'text-slate-400 line-through' : 'text-slate-900'
                          }`}
                        >
                          {act.task}
                        </p>
                        <span className="text-xs text-slate-400">
                          Assigned to {act.assignee || 'Unassigned'}
                        </span>
                      </div>
                    </div>

                    {act.deadline && (
                      <span
                        className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                          act.completed
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
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
