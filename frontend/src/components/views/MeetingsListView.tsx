import React, { useState } from 'react';
import {
  Search,
  Mic,
  Clock,
  Volume2,
  Plus,
  ChevronRight,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import type { SessionState } from '../../types/transcription';
import { VerbaLogo } from '../common/VerbaLogo';

interface MeetingsListViewProps {
  sessions: SessionState[];
  onSelectMeeting: (session: SessionState) => void;
  onStartRecord: () => void;
}

export const MeetingsListView: React.FC<MeetingsListViewProps> = ({
  sessions,
  onSelectMeeting,
  onStartRecord,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterChip, setFilterChip] = useState<'all' | 'today' | 'with-actions'>('all');

  const filteredSessions = sessions
    .filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const title = (s.title || '').toLowerCase();
      const summary = (s.summary?.executive_summary || '').toLowerCase();

      const matchesQuery = !q || (
        title.includes(q) ||
        summary.includes(q)
      );

      if (!matchesQuery) return false;

      if (filterChip === 'today') {
        const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        return (s.started_at || '').includes('Today') || (s.started_at || '').includes(todayStr);
      }
      if (filterChip === 'with-actions') {
        return (s.summary?.action_items?.length || 0) > 0;
      }
      return true;
    })
    .sort((a, b) => (b.duration_seconds || 0) - (a.duration_seconds || 0));

  const hasActiveFilters = searchQuery.trim() !== '' || filterChip !== 'all';

  const formatDuration = (secs: number) => {
    const s = Math.max(0, Math.round(secs));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}h ${m}m`
      : `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F8FAF9] text-slate-900 overflow-hidden relative">
      {/* Scrollable Main Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 pt-3 pb-28 space-y-4">
        {/* Top Header & Fast Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white border border-emerald-950/10 p-1.5 flex items-center justify-center shadow-xs flex-shrink-0">
              <VerbaLogo size="sm" variant="icon" lightMode />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#008751] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                  Meeting Library
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 leading-tight">
                Your Meetings
              </h1>
            </div>
          </div>

          <button
            onClick={onStartRecord}
            className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold shadow-md shadow-emerald-700/20 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Meeting</span>
          </button>
        </div>

        {/* Search + Filter Chips */}
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search meetings, participants, summaries..."
              className="w-full h-11 pl-10 pr-4 rounded-2xl bg-white border border-slate-200/90 text-sm text-slate-900 placeholder:text-slate-400 shadow-xs focus:outline-none focus:border-[#008751] focus:ring-2 focus:ring-emerald-100 transition-all"
              aria-label="Search meetings"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
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
          </div>
        </div>

        {/* Empty State */}
        {filteredSessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center max-w-md mx-auto space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] mt-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-[#008751] mx-auto shadow-xs">
              <Mic className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">
                {hasActiveFilters ? 'No Matching Meetings' : 'No Meetings Yet'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {hasActiveFilters
                  ? 'Try a different search term or clear the filters.'
                  : 'Record your first meeting to get a speaker-labelled transcript and a grounded summary with decisions and action items.'}
              </p>
            </div>
            {!hasActiveFilters && (
              <button
                onClick={onStartRecord}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-semibold shadow-md shadow-emerald-700/20 active:scale-95 transition-all cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Record First Meeting</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session) => {
              const displayTitle = session.title || 'Untitled Meeting';
              const actionCount = session.summary?.action_items?.length || 0;
              const isProcessing = session.status === 'processing';

              return (
                <article
                  key={session.id}
                  onClick={() => onSelectMeeting(session)}
                  className="group bg-white rounded-2xl p-4 border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:border-emerald-300 hover:shadow-md cursor-pointer active:scale-[0.99] transition-all space-y-3"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectMeeting(session);
                    }
                  }}
                  aria-label={`Open meeting ${displayTitle}`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900 leading-snug truncate">
                        {displayTitle}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          <span>{session.started_at || '—'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Summary or Processing State */}
                  <div className="min-h-[2.5rem]">
                    {isProcessing ? (
                      <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200/60 rounded-lg px-2.5 py-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span>Transcribing & summarizing…</span>
                        <div className="flex-1 h-1 bg-amber-100 rounded-full overflow-hidden">
                          <div className="w-[70%] h-full bg-[#008751] rounded-full animate-pulse" />
                        </div>
                      </div>
                    ) : (
                      session.summary?.executive_summary && (
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed pt-0.5">
                          {session.summary.executive_summary}
                        </p>
                      )
                    )}
                  </div>

                  {/* Card Footer: Metadata & Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{formatDuration(session.duration_seconds || 0)}</span>
                      </span>

                      {session.has_audio && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                          <Volume2 className="w-3 h-3 text-[#008751]" />
                          <span>Replay</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {actionCount > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#008751] text-[10px] font-bold border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>{actionCount} {actionCount === 1 ? 'Action' : 'Actions'}</span>
                        </span>
                      )}

                      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-[#008751] group-hover:translate-x-0.5 transition-transform">
                        <span>Open Record</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
