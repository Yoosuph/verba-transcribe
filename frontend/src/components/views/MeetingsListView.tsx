import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Mic,
  Clock,
  Volume2,
  ChevronRight,
  Calendar,
  CheckCircle2,
  ListChecks,
  X,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  Archive,
} from 'lucide-react';
import type { SessionState } from '../../types/transcription';
import { createSession, uploadAudioForProcessing, downloadUrl, searchSessions } from '../../services/api';

interface MeetingsListViewProps {
  sessions: SessionState[];
  onSelectMeeting: (session: SessionState) => void;
  onStartRecord: () => void;
  onRenameMeeting: (sessionId: string, title: string) => Promise<void>;
  onDeleteMeeting: (sessionId: string) => Promise<void>;
  onSessionUpsert?: (session: SessionState) => void;
  onRefresh?: () => void;
  readOnly?: boolean;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Parses backend ISO timestamps and local "Today at HH:MM" strings. */
function parseStarted(startedAt?: string): Date | null {
  if (!startedAt) return null;
  if (startedAt.startsWith('Today at ')) {
    const [h, m] = startedAt.slice('Today at '.length).split(':').map(Number);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0);
  }
  const d = new Date(startedAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayLabel(d: Date, now: Date): string {
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'This Week';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function clockLabel(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const MeetingsListView: React.FC<MeetingsListViewProps> = ({
  sessions,
  onSelectMeeting,
  onStartRecord,
  onRenameMeeting,
  onDeleteMeeting,
  onSessionUpsert,
  onRefresh,
  readOnly = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChip, setFilterChip] = useState<'all' | 'today' | 'with-actions'>('all');

  // Backend full-text search (covers transcript bodies, tags, agendas)
  const [remoteIds, setRemoteIds] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);

  // Import audio state
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  // CRUD UI state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<SessionState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const editingRef = useRef<string | null>(null);

  // Debounced backend search when the query is long enough
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setRemoteIds(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchSessions(q);
        if (!cancelled) setRemoteIds(new Set(results.map((r) => r.id)));
      } catch {
        if (!cancelled) setRemoteIds(null); // fall back to local-only filtering
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (!actionError) return;
    const timer = window.setTimeout(() => setActionError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [actionError]);

  const beginRename = (session: SessionState, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (busyId) return;
    editingRef.current = session.id;
    setEditTitle(session.title || '');
    setEditingId(session.id);
  };

  const cancelRename = () => {
    editingRef.current = null;
    setEditingId(null);
  };

  const commitRename = async () => {
    const id = editingRef.current;
    if (!id) return;
    editingRef.current = null;
    setEditingId(null);
    const trimmed = editTitle.trim();
    const original = sessions.find((s) => s.id === id)?.title || '';
    if (!trimmed || trimmed === original) return;
    setBusyId(id);
    try {
      await onRenameMeeting(id, trimmed);
    } catch {
      setActionError('Could not rename the meeting. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const performDelete = async () => {
    const target = confirmDelete;
    if (!target) return;
    setConfirmDelete(null);
    setBusyId(target.id);
    try {
      await onDeleteMeeting(target.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete the meeting.');
      // Re-sync with the backend in case the delete was rejected (e.g. 409).
    } finally {
      setBusyId(null);
    }
  };

  const filteredSessions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return sessions.filter((s) => {
      // When the backend answered, restrict to matching ids (covers transcript
      // text/tags/agendas the local filter cannot see). Otherwise fall back to
      // a local title/summary match so search still works offline.
      if (remoteIds) {
        if (!remoteIds.has(s.id)) return false;
      } else if (q) {
        const title = (s.title || '').toLowerCase();
        const summary = (s.summary?.executive_summary || '').toLowerCase();
        const tags = (s.tags || []).join(' ').toLowerCase();
        const transcript = (s.final_transcript?.segments || [])
          .map((seg) => seg.text)
          .join(' ')
          .toLowerCase();
        const matchesQuery =
          title.includes(q) ||
          summary.includes(q) ||
          tags.includes(q) ||
          transcript.includes(q);
        if (!matchesQuery) return false;
      }

      if (filterChip === 'today') {
        const todayStr = new Date().toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        return (s.started_at || '').includes('Today') || (s.started_at || '').includes(todayStr);
      }
      if (filterChip === 'with-actions') {
        return (s.summary?.action_items?.length || 0) > 0;
      }
      return true;
    });
  }, [sessions, searchQuery, filterChip, remoteIds]);

  // Most recent first; undated sessions sink to the bottom
  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort(
      (a, b) => (parseStarted(b.started_at)?.getTime() ?? Number.NEGATIVE_INFINITY) -
                (parseStarted(a.started_at)?.getTime() ?? Number.NEGATIVE_INFINITY)
    );
  }, [filteredSessions]);

  // Date-grouped sections (Otter-style library grouping)
  const groups = useMemo(() => {
    const now = new Date();
    const out: { label: string; items: SessionState[] }[] = [];
    for (const s of sortedSessions) {
      const d = parseStarted(s.started_at);
      const label = d ? dayLabel(d, now) : 'Earlier';
      const last = out[out.length - 1];
      if (last && last.label === label) {
        last.items.push(s);
      } else {
        out.push({ label, items: [s] });
      }
    }
    return out;
  }, [sortedSessions]);

  const stats = useMemo(() => {
    const seconds = sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
    const openActions = sessions.reduce(
      (acc, s) =>
        acc + (s.summary?.action_items?.filter((i) => !i.completed).length || 0),
      0
    );
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return {
      total: sessions.length,
      recorded: h > 0 ? `${h}h ${m}m` : `${m}m`,
      openActions,
    };
  }, [sessions]);

  const hasActiveFilters = searchQuery.trim() !== '' || filterChip !== 'all';
  const todayLine = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const formatDuration = (secs: number) => {
    const s = Math.max(0, Math.round(secs));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleImportClick = () => importInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    setImporting(true);
    try {
      const created = await createSession('auto');
      onSessionUpsert?.(created);
      const processed = await uploadAudioForProcessing(created.id, file);
      onSessionUpsert?.(processed);
      onRefresh?.();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not import the audio file.');
    } finally {
      setImporting(false);
    }
  };

  const handleBackup = async () => {
    setBackupBusy(true);
    setImportError(null);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadUrl('/api/export/all', `scribe-backup-${stamp}.zip`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Backup failed.');
    } finally {
      setBackupBusy(false);
    }
  };

  const statTiles = [
    { icon: Calendar, value: String(stats.total), label: 'Meetings' },
    { icon: Clock, value: stats.recorded, label: 'Recorded' },
    { icon: ListChecks, value: String(stats.openActions), label: 'Open Actions' },
  ] as const;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F8FAF9] text-slate-900 overflow-hidden relative">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 pt-3 pb-28 space-y-4">
        {/* Hero: greeting + library stats */}
        <div className="pt-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#008751]">
            {todayLine}
          </p>
          <div className="mt-0.5">
            <h1 className="text-2xl sm:text-[26px] font-black tracking-tight text-slate-900 leading-tight">
              Your Meetings
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {stats.total === 0
                ? 'Tap the soundwave button to record your first meeting.'
                : `${stats.total} ${stats.total === 1 ? 'conversation' : 'conversations'} · ${stats.recorded} recorded`}
            </p>
          </div>
        </div>

        {/* Stats strip */}
        {stats.total > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {statTiles.map(({ icon: Icon, value, label }) => (
              <div
                key={label}
                className="bg-white rounded-2xl border border-slate-200/90 px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col gap-1"
              >
                <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-[#008751]">
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="text-sm font-black text-slate-900 leading-none tabular-nums">
                  {value}
                </div>
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search + filter chips */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search meetings, summaries, decisions..."
                className="w-full h-11 pl-10 pr-4 rounded-2xl bg-white border border-slate-200/90 text-sm text-slate-900 placeholder:text-slate-400 shadow-xs focus:outline-none focus:border-[#008751] focus:ring-2 focus:ring-emerald-100 transition-all"
                aria-label="Search meetings"
              />
              {searching && (
                <Loader2
                  className="w-3.5 h-3.5 text-[#008751] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2"
                  aria-label="Searching"
                />
              )}
            </div>
            {!readOnly && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <input
                  ref={importInputRef}
                  type="file"
                  accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac"
                  className="hidden"
                  onChange={handleImportFile}
                  aria-label="Import audio file"
                />
                <button
                  type="button"
                  onClick={handleImportClick}
                  disabled={importing}
                  title="Import an audio file for transcription"
                  className="h-11 w-11 rounded-2xl bg-white border border-slate-200/90 text-slate-500 hover:text-[#008751] hover:border-emerald-300 flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {importing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleBackup}
                  disabled={backupBusy}
                  title="Download a full backup (JSON + audio) as a zip"
                  className="h-11 w-11 rounded-2xl bg-white border border-slate-200/90 text-slate-500 hover:text-[#008751] hover:border-emerald-300 flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {backupBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Archive className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
          </div>
          {importError && (
            <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {importError}
            </p>
          )}

          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
            {(['all', 'today', 'with-actions'] as const).map((chip) => (
              <button
                key={chip}
                onClick={() => setFilterChip(chip)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer active:scale-95 ${
                  filterChip === chip
                    ? 'bg-[#008751] text-white border-[#008751] shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-800'
                }`}
              >
                {chip === 'all' ? 'All' : chip === 'today' ? 'Today' : 'With Actions'}
              </button>
            ))}
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterChip('all');
                }}
                className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer active:scale-95"
              >
                <X className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Empty states */}
        {sortedSessions.length === 0 ? (
          hasActiveFilters ? (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center max-w-md mx-auto space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] mt-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900">No Matching Meetings</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Try a different search term, or clear the active filters.
                </p>
              </div>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterChip('all');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear filters</span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center max-w-md mx-auto space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] mt-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-[#008751] mx-auto shadow-xs">
                <Mic className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-slate-900">No Meetings Yet</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Record your first meeting to get a speaker-labelled transcript and a grounded
                  summary with decisions and action items.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {['Speaker labels', 'Grounded summary', 'Decisions & actions'].map((t) => (
                  <span
                    key={t}
                    className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/70 text-[10px] font-bold text-emerald-800"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <button
                onClick={onStartRecord}
                disabled={readOnly}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-semibold shadow-md shadow-emerald-700/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Record First Meeting</span>
              </button>
            </div>
          )
        ) : (
          /* Date-grouped meeting list */
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.label} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    {group.label}
                  </h2>
                  <div className="flex-1 h-px bg-slate-200/80" />
                  <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                    {group.items.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {group.items.map((session) => {
                    const displayTitle = session.title || 'Untitled Meeting';
                    const actionCount = session.summary?.action_items?.length || 0;
                    const isProcessing = session.status === 'processing';
                    const isActive = session.status === 'recording' || isProcessing;
                    const isEditing = editingId === session.id;
                    const isBusy = busyId === session.id;
                    const startedDate = parseStarted(session.started_at);
                    const timeText = startedDate
                      ? group.label === 'Today' || group.label === 'Yesterday'
                        ? clockLabel(startedDate)
                        : startedDate.toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })
                      : session.started_at || '—';

                    return (
                      <article
                        key={session.id}
                        onClick={() => {
                          if (!isEditing) onSelectMeeting(session);
                        }}
                        className="group bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:border-emerald-300 hover:shadow-md cursor-pointer active:scale-[0.99] transition-all flex items-start gap-3"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectMeeting(session);
                          }
                        }}
                        aria-label={`Open meeting ${displayTitle}`}
                      >
                        {/* Leading icon tile */}
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-[#008751] flex-shrink-0 shadow-xs">
                          {isProcessing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Mic className="w-4 h-4" />
                          )}
                        </div>

                        {/* Body */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            {isEditing ? (
                              <input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => void commitRename()}
                                onKeyDown={(e) => {
                                  e.stopPropagation();
                                  if (e.key === 'Enter') e.currentTarget.blur();
                                  if (e.key === 'Escape') cancelRename();
                                }}
                                maxLength={200}
                                autoFocus
                                aria-label="Meeting title"
                                className="text-sm font-bold text-slate-900 leading-snug w-full min-w-0 rounded-lg border border-[#008751] bg-emerald-50/40 px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                              />
                            ) : (
                              <h3 className="text-sm font-bold text-slate-900 leading-snug truncate">
                                {displayTitle}
                              </h3>
                            )}
                            {!readOnly && (
                              <div
                                className="flex items-center gap-0.5 flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {!readOnly && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => beginRename(session, e)}
                                      disabled={isBusy || isEditing}
                                      aria-label={`Rename ${displayTitle}`}
                                      title="Rename meeting"
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-[#008751] hover:bg-emerald-50 disabled:opacity-40 active:scale-95 transition-all cursor-pointer"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isBusy) return;
                                        if (isActive) {
                                          setActionError(
                                            session.status === 'recording'
                                              ? 'This meeting is still recording — deletion is blocked until it stops.'
                                              : 'This meeting is still being processed — deletion is blocked until it finishes.'
                                          );
                                          return;
                                        }
                                        setConfirmDelete(session);
                                      }}
                                      aria-disabled={isActive || isBusy}
                                      aria-label={`Delete ${displayTitle}`}
                                      title={
                                        isActive
                                          ? 'Cannot delete while the meeting is active'
                                          : 'Delete meeting'
                                      }
                                      className={`p-1.5 rounded-lg transition-all active:scale-95 ${
                                        isActive || isBusy
                                          ? 'text-slate-300 cursor-not-allowed'
                                          : 'text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer'
                                      }`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-[#008751] group-hover:translate-x-0.5 transition-all mt-0.5" />
                              </div>
                            )}
                          </div>

                          <div className="min-h-[1.25rem] mt-0.5">
                            {isProcessing ? (
                              <div className="flex items-center gap-2 text-[11px] text-amber-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <span>Transcribing &amp; summarizing…</span>
                                <div className="flex-1 h-1 bg-amber-100 rounded-full overflow-hidden min-w-8">
                                  <div className="w-[70%] h-full bg-[#008751] rounded-full animate-pulse" />
                                </div>
                              </div>
                            ) : (
                              session.summary?.executive_summary && (
                                <p className="text-xs text-slate-500 line-clamp-1 leading-relaxed">
                                  {session.summary.executive_summary}
                                </p>
                              )
                            )}
                          </div>

                          {/* Meta row */}
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-[10px] text-slate-400">
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Clock className="w-2.5 h-2.5" />
                              {formatDuration(session.duration_seconds || 0)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5" />
                              {timeText}
                            </span>
                            {session.has_audio && (
                              <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded-full font-bold border border-emerald-200">
                                <Volume2 className="w-2.5 h-2.5 text-[#008751]" />
                                Replay
                              </span>
                            )}
                            {actionCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[#008751] bg-emerald-50 px-1.5 py-0.5 rounded-full font-bold border border-emerald-200">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                {actionCount} {actionCount === 1 ? 'Action' : 'Actions'}
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-meeting-heading"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600 flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 id="delete-meeting-heading" className="text-sm font-black text-slate-900">
                  Delete this recording?
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed mt-1 break-words">
                  <span className="font-bold text-slate-700">“{confirmDelete.title || 'Untitled Meeting'}”</span>{' '}
                  and its audio will be permanently removed. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void performDelete()}
                className="flex-1 px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md shadow-red-600/20 active:scale-95 transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transient action error toast */}
      {actionError && (
        <div
          role="alert"
          className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 max-w-[90%] px-4 py-2.5 rounded-full bg-slate-900/90 text-white text-xs font-semibold shadow-lg"
        >
          {actionError}
        </div>
      )}
    </div>
  );
};
