import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Play,
  Pause,
  Download,
  CheckSquare,
  Square,
  Clock,
  Calendar,
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
  Bookmark,
  BookmarkPlus,
  Share2,
  Link2,
  Trash2,
  X,
  Send,
  Printer,
  Tag,
  Loader2,
  CalendarDays,
} from 'lucide-react';
import type { SessionState, TranscriptSegment } from '../../types/transcription';
import {
  addBookmark,
  askQuestion,
  createShare,
  deleteBookmark,
  downloadUrl,
  editSegment,
  fetchSession,
  renameSpeaker as apiRenameSpeaker,
  revokeShare,
  toggleAction as apiToggleAction,
  updateSession,
} from '../../services/api';
import { withTokenParam, isShareMode } from '../../services/auth';
import { SpeakerManagerModal } from '../speakers/SpeakerManagerModal';

interface MeetingDetailViewProps {
  session: SessionState;
  onBack: () => void;
  /** Called after any mutation so the parent store can refresh its copy. */
  onSessionUpdated?: (session: SessionState) => void;
  /** Disables all mutation controls (share links / viewer role). */
  readOnly?: boolean;
  initialTab?: 'summary' | 'transcript' | 'actions' | 'ask';
}

type DetailTab = 'summary' | 'transcript' | 'actions' | 'ask';

const formatTime = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
};

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const;

const buildShareUrl = (token: string, sessionId: string) =>
  `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(token)}#/transcript/${sessionId}`;

export const MeetingDetailView: React.FC<MeetingDetailViewProps> = ({
  session,
  onBack,
  onSessionUpdated,
  readOnly = false,
  initialTab = 'summary',
}) => {
  // Share-mode visitors are always read-only, regardless of the prop.
  const viewOnly = readOnly || isShareMode();

  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTtl, setShareTtl] = useState(168);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Inline segment editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingSegment, setSavingSegment] = useState(false);

  // Action items / bookmarks busy flags
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);

  // Tags
  const [tagInput, setTagInput] = useState('');

  // Ask tab
  const [askInput, setAskInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // Evidence jump highlight
  const [highlightSegmentId, setHighlightSegmentId] = useState<string | null>(null);

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

  // Transient toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Scroll evidence/seek highlights into view
  useEffect(() => {
    if (!highlightSegmentId) return;
    const el = document.getElementById(highlightSegmentId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = window.setTimeout(() => setHighlightSegmentId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlightSegmentId]);

  /** Re-fetches the session and hands it to the parent store. */
  const emit = useCallback(async () => {
    if (!onSessionUpdated) return;
    try {
      const fresh = await fetchSession(session.id);
      onSessionUpdated(fresh);
    } catch {
      /* backend unreachable — parent keeps its current copy */
    }
  }, [session.id, onSessionUpdated]);

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

  const seekAndPlay = (time: number) => {
    seekAudio(time);
    if (!isPlaying) togglePlay();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const displayName = (speaker: string) => session.speaker_names?.[speaker] || speaker;

  const summary = session.summary;
  const segments = useMemo(
    () => session.final_transcript?.segments ?? [],
    [session.final_transcript]
  );
  const bookmarks = session.bookmarks || [];
  const qaHistory = session.qa_history || [];
  const tags = session.tags || [];
  const actionItems = summary?.action_items || [];

  const speakers = useMemo(() => {
    const set = new Set<string>(segments.map((s) => s.speaker));
    Object.keys(session.speaker_names || {}).forEach((k) => set.add(k));
    return Array.from(set);
  }, [segments, session.speaker_names]);

  const speakerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const seg of segments) {
      counts[seg.speaker] = (counts[seg.speaker] || 0) + 1;
    }
    return counts;
  }, [segments]);

  /** Segment currently under the playhead (synced highlight). */
  const activeSegmentId = useMemo(() => {
    if (!hasAudioError && session.audio_url && session.has_audio !== false) {
      const seg = segments.find(
        (s) => playbackSeconds >= s.start && playbackSeconds < s.end
      );
      if (seg) return seg.id;
    }
    return null;
  }, [segments, playbackSeconds, session.audio_url, session.has_audio, hasAudioError]);

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

  // ---------- mutations (self-owned; always target session.id) ----------

  const handleToggleAction = async (id: string) => {
    if (viewOnly || busyActionId) return;
    const item = actionItems.find((a) => a.id === id);
    if (!item) return;
    setBusyActionId(id);
    try {
      await apiToggleAction(session.id, id, !item.completed);
      await emit();
    } catch {
      setToast('Could not update the action item.');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleRenameSpeaker = async (oldName: string, newName: string) => {
    if (viewOnly) return;
    try {
      await apiRenameSpeaker(session.id, oldName, newName);
      await emit();
    } catch {
      setToast('Could not rename the speaker.');
    }
  };

  const startEditSegment = (seg: TranscriptSegment) => {
    if (viewOnly) return;
    setEditingId(seg.id);
    setEditDraft(seg.text);
  };

  const cancelEditSegment = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const saveEditSegment = async (seg: TranscriptSegment) => {
    const text = editDraft.trim();
    if (!text || text === seg.text) {
      cancelEditSegment();
      return;
    }
    setSavingSegment(true);
    try {
      await editSegment(session.id, seg.id, { text });
      await emit();
      cancelEditSegment();
    } catch {
      setToast('Could not save the transcript edit.');
    } finally {
      setSavingSegment(false);
    }
  };

  const handleAddBookmark = async (body: {
    segment_id?: string;
    time_seconds?: number;
    note?: string;
  }) => {
    if (viewOnly || bookmarkBusy) return;
    setBookmarkBusy(true);
    try {
      await addBookmark(session.id, body);
      await emit();
    } catch {
      setToast('Could not add the bookmark.');
    } finally {
      setBookmarkBusy(false);
    }
  };

  const handleRemoveBookmark = async (bookmarkId: string) => {
    if (viewOnly || bookmarkBusy) return;
    setBookmarkBusy(true);
    try {
      await deleteBookmark(session.id, bookmarkId);
      await emit();
    } catch {
      setToast('Could not remove the bookmark.');
    } finally {
      setBookmarkBusy(false);
    }
  };

  const commitTags = async (next: string[]) => {
    try {
      await updateSession(session.id, { tags: next });
      await emit();
    } catch {
      setToast('Could not update tags.');
    }
  };

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTagInput('');
      return;
    }
    if (tags.length >= 20) {
      setToast('Tag limit reached (20).');
      return;
    }
    setTagInput('');
    void commitTags([...tags, t]);
  };

  const removeTag = (tag: string) => {
    void commitTags(tags.filter((x) => x !== tag));
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = askInput.trim();
    if (!q || asking || viewOnly) return;
    setAsking(true);
    setAskError(null);
    try {
      await askQuestion(session.id, q);
      setAskInput('');
      await emit();
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Could not answer that question.');
    } finally {
      setAsking(false);
    }
  };

  const jumpToEvidence = (segmentId: string) => {
    setActiveTab('transcript');
    // Allow the tab switch to render before scrolling.
    window.setTimeout(() => setHighlightSegmentId(segmentId), 50);
  };

  const evidenceLabel = (segmentId: string) => {
    const seg = segments.find((s) => s.id === segmentId);
    return seg ? `@ ${formatTime(seg.start)}` : segmentId.slice(0, 8);
  };

  const handleCreateShare = async () => {
    if (viewOnly || shareBusy) return;
    setShareBusy(true);
    try {
      await createShare(session.id, shareTtl);
      await emit();
    } catch {
      setToast('Could not create the share link.');
    } finally {
      setShareBusy(false);
    }
  };

  const handleRevokeShare = async () => {
    if (viewOnly || shareBusy) return;
    setShareBusy(true);
    try {
      await revokeShare(session.id);
      await emit();
      setShareCopied(false);
    } catch {
      setToast('Could not revoke the share link.');
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareLink = () => {
    if (!session.share_token) return;
    navigator.clipboard
      ?.writeText(buildShareUrl(session.share_token, session.id))
      .then(() => {
        setShareCopied(true);
        window.setTimeout(() => setShareCopied(false), 2000);
      })
      .catch(() => setToast('Could not copy the link.'));
  };

  const doExport = async (format: 'markdown' | 'txt' | 'json') => {
    setExportOpen(false);
    const ext = format === 'markdown' ? 'md' : format;
    try {
      await downloadUrl(
        `/api/sessions/${session.id}/export?format=${format}`,
        `meeting_${session.id}.${ext}`
      );
    } catch {
      setToast('Export failed. Please try again.');
    }
  };

  const doIcsExport = async () => {
    setExportOpen(false);
    try {
      await downloadUrl(`/api/sessions/${session.id}/ics`, `meeting_${session.id}.ics`);
    } catch {
      setToast('Calendar export failed.');
    }
  };

  const doPrint = () => {
    setExportOpen(false);
    window.print();
  };

  // ---------------------------------------------------------------------

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F8FAF9] text-slate-900 overflow-hidden relative select-none">
      {/* Header */}
      <div className="no-print flex items-start justify-between gap-3 px-4 sm:px-6 pt-3 pb-3 border-b border-slate-200/80 flex-shrink-0 bg-white/90 backdrop-blur-sm">
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={onBack}
            className="h-9 rounded-xl bg-white hover:bg-slate-100 border border-slate-200/90 active:scale-[0.98] transition-all flex items-center gap-1 px-2.5 text-slate-700 shadow-xs cursor-pointer flex-shrink-0"
            title="Back to all meetings"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-xs font-bold">Meetings</span>
          </button>
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#008751] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
              Meeting Record
            </span>
            <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-tight mt-0.5 truncate">
              {session.title || 'Untitled Meeting'}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3 text-slate-400" /> {formatTime(session.duration_seconds || 0)}
              </span>
              {session.template && (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <FileText className="w-3 h-3 text-slate-400" /> {session.template}
                </span>
              )}
            </div>

            {/* Tags editor */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="group inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600"
                >
                  <Tag className="w-2.5 h-2.5 text-slate-400" />
                  {tag}
                  {!viewOnly && (
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="p-0.5 rounded-full text-slate-400 hover:text-red-500 cursor-pointer"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              ))}
              {!viewOnly && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addTag(tagInput);
                  }}
                >
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="+ tag"
                    maxLength={32}
                    aria-label="Add tag"
                    className="w-20 px-2 py-0.5 rounded-full border border-dashed border-slate-300 bg-white text-[10px] font-semibold text-slate-600 placeholder:text-slate-400 focus:outline-none focus:border-[#008751] focus:ring-1 focus:ring-emerald-200"
                  />
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Share + Export menus */}
        <div className="flex items-start gap-1.5 flex-shrink-0">
          {!viewOnly && (
            <div className="relative">
              <button
                onClick={() => {
                  setShareOpen((v) => !v);
                  setExportOpen(false);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer border ${
                  session.share_token
                    ? 'bg-emerald-50 text-[#008751] border-emerald-200 hover:bg-emerald-100'
                    : 'bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50'
                }`}
                title="Share a read-only link"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Share</span>
              </button>
              {shareOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShareOpen(false)} />
                  <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                        <Share2 className="w-3.5 h-3.5 text-[#008751]" />
                        Share (read-only)
                      </h3>
                      <button
                        onClick={() => setShareOpen(false)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                        aria-label="Close share menu"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {session.share_token ? (
                      <>
                        <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5">
                          <Link2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="text-[10px] font-mono text-slate-600 truncate flex-1">
                            {buildShareUrl(session.share_token, session.id)}
                          </span>
                        </div>
                        {session.share_expires_at && (
                          <p className="text-[10px] text-slate-500">
                            Expires {new Date(session.share_expires_at).toLocaleString()}
                          </p>
                        )}
                        <div className="flex gap-1.5">
                          <button
                            onClick={copyShareLink}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold active:scale-95 transition-all cursor-pointer"
                          >
                            {shareCopied ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            {shareCopied ? 'Copied' : 'Copy link'}
                          </button>
                          <button
                            onClick={handleRevokeShare}
                            disabled={shareBusy}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                            title="Revoke this share link"
                          >
                            {shareBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Create a link that lets anyone view this meeting — no editing, no
                          access to your other meetings.
                        </p>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={shareTtl}
                            onChange={(e) => setShareTtl(Number(e.target.value))}
                            aria-label="Link lifetime"
                            className="flex-1 px-2 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#008751]"
                          >
                            <option value={24}>24 hours</option>
                            <option value={168}>7 days</option>
                            <option value={720}>30 days</option>
                          </select>
                          <button
                            onClick={handleCreateShare}
                            disabled={shareBusy}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                          >
                            {shareBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Link2 className="w-3.5 h-3.5" />
                            )}
                            Create link
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => {
                setExportOpen((v) => !v);
                setShareOpen(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
              title="Export meeting record"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  {(
                    [
                      ['markdown', 'Markdown (.md)', FileText],
                      ['txt', 'Plain text (.txt)', FileText],
                      ['json', 'JSON (.json)', FileText],
                    ] as const
                  ).map(([fmt, label, Icon]) => (
                    <button
                      key={fmt}
                      onClick={() => doExport(fmt)}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-[#008751] transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                  <div className="h-px bg-slate-100" />
                  <button
                    onClick={doIcsExport}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-[#008751] transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    Calendar (.ics)
                  </button>
                  <button
                    onClick={doPrint}
                    className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-[#008751] transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print / PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Audio player */}
      {hasAudio && (
        <div className="no-print px-4 sm:px-6 py-3 bg-white border-b border-slate-200/80 flex-shrink-0">
          <audio
            ref={audioRef}
            src={withTokenParam(session.audio_url ?? '')}
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
            {!viewOnly && (
              <button
                onClick={() =>
                  handleAddBookmark({ time_seconds: playbackSeconds, note: '' })
                }
                disabled={bookmarkBusy}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-500 hover:text-amber-600 cursor-pointer active:scale-95 transition-all flex-shrink-0 disabled:opacity-50"
                title="Bookmark the current moment"
              >
                <BookmarkPlus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="no-print px-4 sm:px-6 pt-3 flex-shrink-0">
        <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80">
          {(
            [
              ['summary', 'Summary', Sparkles],
              ['transcript', 'Transcript', FileText],
              ['actions', `Actions${actionItems.length ? ` (${actionItems.length})` : ''}`, ListChecks],
              ['ask', `Ask${qaHistory.length ? ` (${qaHistory.length})` : ''}`, Send],
            ] as const
          ).map(([tab, label, Icon]) => (
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

      {/* Scrollable content (printed as the report body) */}
      <article
        id="meeting-report"
        className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 pb-28 space-y-4"
      >
        {/* ================= TAB: SUMMARY ================= */}
        {activeTab === 'summary' && (
          <div className="space-y-4 max-w-3xl">
            {session.agenda && (
              <section className="break-inside-avoid bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-[#008751]" /> Agenda
                </h2>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {session.agenda}
                </p>
              </section>
            )}
            {summary ? (
              <>
                <section className="break-inside-avoid bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
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
                  <section className="break-inside-avoid bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
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
                  <section className="break-inside-avoid bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                      <BadgeCheck className="w-4 h-4 text-[#008751]" /> Decisions Made
                    </h2>
                    <div className="space-y-2">
                      {summary.decisions.map((d, i) => (
                        <div key={d.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs sm:text-sm text-slate-800 leading-relaxed break-inside-avoid">
                          <span className="font-bold text-[#008751] mr-1.5">{i + 1}.</span>
                          {d.decision}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {summary.questions.length > 0 && (
                  <section className="break-inside-avoid bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
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
                  <section className="break-inside-avoid bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
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
                <div className="no-print flex items-center gap-2">
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

                {/* Bookmarks strip */}
                {bookmarks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {bookmarks.map((b) => (
                      <span
                        key={b.id}
                        className="group inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800"
                      >
                        <button
                          type="button"
                          onClick={() => hasAudio && seekAndPlay(b.time_seconds)}
                          className="inline-flex items-center gap-1 cursor-pointer hover:text-amber-950"
                          title={hasAudio ? `Jump to ${formatTime(b.time_seconds)}` : 'Bookmark'}
                        >
                          <Bookmark className="w-3 h-3 fill-current" />
                          {formatTime(b.time_seconds)}
                        </button>
                        {b.note && (
                          <span className="font-medium text-amber-700 truncate max-w-[120px]">{b.note}</span>
                        )}
                        {!viewOnly && (
                          <button
                            type="button"
                            onClick={() => handleRemoveBookmark(b.id)}
                            disabled={bookmarkBusy}
                            className="ml-0.5 p-0.5 rounded-full text-amber-500 hover:text-red-600 cursor-pointer disabled:opacity-50"
                            aria-label="Delete bookmark"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  {filteredSegments.map((seg) => {
                    const isEditing = editingId === seg.id;
                    const isHighlighted = highlightSegmentId === seg.id;
                    const isActive = activeSegmentId === seg.id;
                    return (
                      <article
                        key={seg.id}
                        id={seg.id}
                        className={`p-3.5 rounded-xl bg-white border transition-all break-inside-avoid ${
                          isHighlighted
                            ? 'border-amber-300 ring-2 ring-amber-400 bg-amber-50/40'
                            : isActive
                            ? 'border-emerald-400 ring-1 ring-emerald-200 bg-emerald-50/40'
                            : 'border-slate-200/90 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-bold text-slate-900">{displayName(seg.speaker)}</span>
                            {!viewOnly && (
                              <button
                                onClick={() => {
                                  setRenameTarget(seg.speaker);
                                  setRenameOpen(true);
                                }}
                                className="text-slate-400 hover:text-[#008751] cursor-pointer"
                                title="Rename speaker"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {hasAudio && (
                              <button
                                onClick={() => seekAndPlay(seg.start)}
                                className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-[#008751] bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded cursor-pointer active:scale-95 transition-all"
                                title={`Play from ${formatTime(seg.start)}`}
                              >
                                <Play className="w-2.5 h-2.5 fill-current" />
                                {formatTime(seg.start)}
                              </button>
                            )}
                            {!viewOnly && (
                              <button
                                onClick={() =>
                                  handleAddBookmark({
                                    segment_id: seg.id,
                                    time_seconds: seg.start,
                                    note: seg.text.slice(0, 80),
                                  })
                                }
                                disabled={bookmarkBusy}
                                className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 cursor-pointer disabled:opacity-50 transition-all"
                                title="Bookmark this segment"
                              >
                                <BookmarkPlus className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!viewOnly && !isEditing && (
                              <button
                                onClick={() => startEditSegment(seg)}
                                className="p-1 rounded text-slate-400 hover:text-[#008751] hover:bg-emerald-50 cursor-pointer transition-all"
                                title="Edit this segment"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              rows={3}
                              maxLength={4000}
                              autoFocus
                              aria-label="Edit transcript segment"
                              className="w-full text-xs sm:text-sm text-slate-800 leading-relaxed rounded-lg border border-[#008751] bg-emerald-50/30 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-y"
                            />
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={cancelEditSegment}
                                disabled={savingSegment}
                                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-600 cursor-pointer active:scale-95 transition-all disabled:opacity-50"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveEditSegment(seg)}
                                disabled={savingSegment || !editDraft.trim()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold cursor-pointer active:scale-95 transition-all disabled:opacity-50"
                              >
                                {savingSegment && <Loader2 className="w-3 h-3 animate-spin" />}
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">{seg.text}</p>
                        )}
                      </article>
                    );
                  })}
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
            <div className="break-inside-avoid bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
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
                      onClick={() => handleToggleAction(item.id)}
                      disabled={viewOnly || busyActionId === item.id}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 ${
                        viewOnly
                          ? 'cursor-default'
                          : 'cursor-pointer'
                      } ${
                        item.completed
                          ? 'bg-emerald-50/50 border-emerald-200/70'
                          : 'bg-white border-slate-200/90 hover:border-slate-300'
                      } ${busyActionId === item.id ? 'opacity-60' : ''}`}
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

        {/* ================= TAB: ASK ================= */}
        {activeTab === 'ask' && (
          <div className="space-y-4 max-w-3xl">
            <section className="break-inside-avoid bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Send className="w-4 h-4 text-[#008751]" /> Ask about this meeting
              </h2>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Answers are grounded in the transcript and link back to the exact segments.
              </p>
              <form onSubmit={handleAsk} className="flex gap-2 mt-3">
                <input
                  value={askInput}
                  onChange={(e) => setAskInput(e.target.value)}
                  disabled={asking || viewOnly}
                  maxLength={500}
                  placeholder={
                    viewOnly
                      ? 'View-only link — questions are disabled'
                      : 'e.g. What did we decide about the budget?'
                  }
                  aria-label="Ask a question"
                  className="flex-1 min-w-0 px-3 py-2.5 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#008751]/30 disabled:bg-slate-50 disabled:text-slate-400"
                />
                <button
                  type="submit"
                  disabled={asking || viewOnly || !askInput.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                >
                  {asking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Ask
                </button>
              </form>
              {askError && (
                <p role="alert" className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {askError}
                </p>
              )}
            </section>

            {qaHistory.length > 0 ? (
              [...qaHistory].reverse().map((qa, i) => (
                <section
                  key={`${qa.created_at}_${i}`}
                  className="break-inside-avoid bg-white rounded-2xl border border-slate-200/90 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
                >
                  <div className="flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-[#008751] mt-0.5 flex-shrink-0" />
                    <p className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">{qa.question}</p>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed mt-2 pl-6">{qa.answer}</p>
                  {qa.evidence_segment_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 pl-6">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 self-center mr-1">
                        Evidence
                      </span>
                      {qa.evidence_segment_ids.map((sid) => (
                        <button
                          key={sid}
                          type="button"
                          onClick={() => jumpToEvidence(sid)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300 cursor-pointer active:scale-95 transition-all"
                          title="Jump to this segment in the transcript"
                        >
                          <FileText className="w-2.5 h-2.5" />
                          {evidenceLabel(sid)}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-2 pl-6">
                    {new Date(qa.created_at).toLocaleString()}
                  </p>
                </section>
              ))
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center">
                <Send className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700">No questions yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  Ask anything about this meeting — answers cite the transcript.
                </p>
              </div>
            )}
          </div>
        )}
      </article>

      {/* Speaker rename modal (editor only) */}
      {!viewOnly && (
        <SpeakerManagerModal
          isOpen={renameOpen}
          onClose={() => setRenameOpen(false)}
          speakers={speakers}
          onRenameSpeaker={handleRenameSpeaker}
          targetSpeaker={renameTarget}
          speakerCounts={speakerCounts}
        />
      )}

      {/* Transient toast */}
      {toast && (
        <div
          role="alert"
          className="no-print fixed bottom-28 left-1/2 -translate-x-1/2 z-50 max-w-[90%] px-4 py-2.5 rounded-full bg-slate-900/90 text-white text-xs font-semibold shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
};
