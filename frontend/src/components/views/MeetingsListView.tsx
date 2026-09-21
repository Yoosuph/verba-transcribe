import React, { useState } from 'react';
import { Search, Mic, Clock, Volume2, Plus, Scale, Gavel, User, ChevronRight, Calendar } from 'lucide-react';
import type { SessionState } from '../../types/transcription';
import { JudiciaryLogo } from '../common/JudiciaryLogo';

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
  const [filterChip, setFilterChip] = useState<'all' | 'today' | 'mirath' | 'orders'>('all');

  // Filter meetings based on search & filter chip
  const filteredSessions = sessions.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    const caseNum = (s.case_info?.case_number || '').toLowerCase();
    const court = (s.case_info?.court || '').toLowerCase();
    const claimant = (s.parties?.claimant || '').toLowerCase();
    const defendant = (s.parties?.defendant || '').toLowerCase();
    const title = (s.title || '').toLowerCase();
    const summary = (s.summary?.executive_summary || '').toLowerCase();
    const cause = (s.case_info?.hearing_type || '').toLowerCase();

    const matchesQuery = !q || (
      caseNum.includes(q) ||
      court.includes(q) ||
      claimant.includes(q) ||
      defendant.includes(q) ||
      title.includes(q) ||
      summary.includes(q) ||
      cause.includes(q)
    );

    if (!matchesQuery) return false;

    if (filterChip === 'today') {
      const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      return (s.case_info?.hearing_date || '').includes(todayStr) || (s.started_at || '').includes('Today');
    }
    if (filterChip === 'mirath') {
      return (s.case_info?.hearing_type || '').toLowerCase().includes('mirath') ||
        (s.case_info?.hearing_type || '').toLowerCase().includes('inheritance');
    }
    if (filterChip === 'orders') {
      return (s.hearing_report?.orders?.length || 0) > 0 || (s.summary?.decisions?.length || 0) > 0;
    }
    return true;
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F8FAF9] text-slate-900 overflow-hidden relative">
      {/* Scrollable Main Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 pt-3 pb-28 space-y-4">
        {/* Top Header & Fast Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white border border-emerald-950/10 p-1.5 flex items-center justify-center shadow-xs flex-shrink-0">
              <JudiciaryLogo size="sm" variant="crest" lightMode={true} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#008751] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                  Cause List & Registry
                </span>
                <span className="text-[11px] text-slate-500 font-medium">Jigawa State Judiciary</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight leading-tight mt-0.5">
                Court Proceedings
              </h1>
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            onClick={onStartRecord}
            className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007345] active:bg-[#00603a] text-white font-bold text-xs shadow-sm hover:shadow active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer"
            title="Start New Hearing Recording"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Hearing & Record</span>
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="space-y-2.5 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
          {/* Search Bar */}
          <div className="relative">
            <div className="w-full bg-slate-50 border border-slate-200/80 hover:border-slate-300 focus-within:border-[#008751] focus-within:ring-2 focus-within:ring-[#008751]/20 rounded-xl px-3.5 py-2 flex items-center gap-2.5 transition-all">
              <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search suit number, parties, counsel, or cause..."
                className="bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none w-full font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filter Chips Horizontal Row */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-[11px] font-semibold">
            <button
              onClick={() => setFilterChip('all')}
              className={`px-3 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
                filterChip === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              All Proceedings ({sessions.length})
            </button>
            <button
              onClick={() => setFilterChip('today')}
              className={`px-3 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
                filterChip === 'today'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              Today's Sittings
            </button>
            <button
              onClick={() => setFilterChip('mirath')}
              className={`px-3 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
                filterChip === 'mirath'
                  ? 'bg-[#008751] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              Inheritance (Mirath)
            </button>
            <button
              onClick={() => setFilterChip('orders')}
              className={`px-3 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
                filterChip === 'orders'
                  ? 'bg-amber-800 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              With Orders / Decrees
            </button>
          </div>
        </div>

        {/* Docket Section List */}
        {filteredSessions.length === 0 ? (
          <div className="py-14 px-4 bg-white rounded-2xl border border-slate-200/80 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-[#008751] flex items-center justify-center shadow-xs">
              <Scale className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-base font-bold text-slate-900">
                {searchQuery ? 'No matching proceedings found' : 'No hearing proceedings on record yet'}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {searchQuery
                  ? 'Try refining your suit number, party name, or clear search filter.'
                  : 'Open a new court proceeding to transcribe live testimony, record dialogue, and generate certified judicial hearing reports.'}
              </p>
            </div>
            <button
              onClick={onStartRecord}
              className="px-4 py-2.5 rounded-xl bg-[#008751] hover:bg-[#007345] text-white text-xs font-bold shadow-sm active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Open New Hearing</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session) => {
              const isProcessing = session.status === 'processing';
              const orderCount = (session.hearing_report?.orders?.length || 0) + (session.summary?.decisions?.length || 0);
              const durationSecs = session.duration_seconds || 0;
              const durationFormatted = durationSecs >= 60
                ? `${Math.round(durationSecs / 60)} min`
                : `${Math.round(durationSecs)} sec`;

              const suitNo = session.case_info?.case_number || 'JGS/SCA/DTS/CV/018/2026';
              const hearingDate = session.case_info?.hearing_date || session.started_at || 'Today';
              const hearingType = session.case_info?.hearing_type || 'Civil Appeal';
              const claimantName = session.parties?.claimant?.split('(')[0].trim() || 'Appellant';
              const defendantName = session.parties?.defendant?.split('(')[0].trim() || 'Respondent';
              const presiding = session.case_info?.judge || 'Hon. Kadi Sani Salihu';
              const division = session.case_info?.division || 'Dutse Judicial Division';

              return (
                <article
                  key={session.id}
                  onClick={() => onSelectMeeting(session)}
                  className="group bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-[#008751]/60 transition-all duration-150 cursor-pointer space-y-3 touch-press"
                >
                  {/* Card Header: Suit Number & Division Tag */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2.5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                        {suitNo}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                        {division.replace(' Judicial Division', '')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{hearingDate}</span>
                    </div>
                  </div>

                  {/* Card Main: Parties & Cause */}
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="text-sm sm:text-base font-bold text-slate-900 group-hover:text-[#008751] transition-colors leading-snug">
                        {claimantName} <span className="text-slate-400 font-serif italic text-xs font-normal">v.</span> {defendantName}
                      </h2>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-[#008751] font-semibold">
                      <Gavel className="w-3 h-3 text-[#008751] flex-shrink-0" />
                      <span className="truncate">{hearingType}</span>
                    </div>

                    {isProcessing ? (
                      <div className="pt-2 pb-1">
                        <div className="flex items-center justify-between text-xs font-semibold text-[#008751] mb-1">
                          <span className="animate-pulse">Transcribing & diarizing judicial record...</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="w-[70%] h-full bg-[#008751] rounded-full animate-pulse" />
                        </div>
                      </div>
                    ) : (
                      session.summary?.executive_summary && (
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed pt-0.5 text-justify">
                          {session.summary.executive_summary}
                        </p>
                      )
                    )}
                  </div>

                  {/* Card Footer: Metadata & Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[140px] sm:max-w-[180px]">{presiding}</span>
                      </span>

                      <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{durationFormatted}</span>
                      </span>

                      {session.has_audio && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                          <Volume2 className="w-3 h-3 text-[#008751]" />
                          <span>Replay</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {orderCount > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#008751] text-[10px] font-bold border border-emerald-200 flex items-center gap-1">
                          <Gavel className="w-2.5 h-2.5" />
                          <span>{orderCount} {orderCount === 1 ? 'Order' : 'Orders'}</span>
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
