import React, { useState } from 'react';
import { Search, Mic, Clock, Volume2 } from 'lucide-react';
import type { SessionState } from '../../types/transcription';

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
  const [filterChip, setFilterChip] = useState<'all' | 'today' | 'starred' | 'actions'>('all');

  // Filter meetings based on search & chip
  const filteredSessions = sessions.filter((s) => {
    const titleMatch = (s.title || 'Meeting').toLowerCase().includes(searchQuery.toLowerCase());
    const snippetMatch = (s.summary?.executive_summary || '').toLowerCase().includes(searchQuery.toLowerCase());
    const match = titleMatch || snippetMatch;

    if (!match) return false;
    if (filterChip === 'actions') return (s.summary?.action_items?.length || 0) > 0;
    return true;
  });

  // Assign distinct colors to speaker names
  const speakerColorPalette = [
    'bg-[#008751]',
    'bg-[#059669]',
    'bg-[#D97706]',
    'bg-[#B45309]',
    'bg-[#0284C7]',
    'bg-[#475569]',
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFC] text-slate-900 overflow-hidden relative">
      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-28 space-y-4">
        {/* Header: Title + Judicial Badge */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <h1 className="text-[28px] sm:text-[32px] font-extrabold text-slate-900 tracking-tight leading-tight">
              Court Proceedings
            </h1>
            <p className="text-xs text-emerald-800/80 font-medium">
              Official Hearing Records & Transcripts
            </p>
          </div>
          <div className="w-10 h-10 rounded-full bg-emerald-100/80 border border-emerald-300/60 text-[#008751] font-bold text-xs flex items-center justify-center shadow-xs" title="Court Registrar">
            CR
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <div className="w-full bg-[#EEF2F6] hover:bg-[#E9EEF4] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#008751]/30 rounded-full px-4 py-2.5 flex items-center gap-2.5 transition-all">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search testimony, statements, or rulings..."
              className="bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none w-full font-normal"
            />
          </div>
        </div>

        {/* Filter Chips Horizontal Row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs font-medium">
          <button
            onClick={() => setFilterChip('all')}
            className={`px-4 py-1.5 rounded-full transition-all whitespace-nowrap ${
              filterChip === 'all'
                ? 'bg-[#111827] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterChip('today')}
            className={`px-4 py-1.5 rounded-full transition-all whitespace-nowrap ${
              filterChip === 'today'
                ? 'bg-[#111827] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setFilterChip('starred')}
            className={`px-4 py-1.5 rounded-full transition-all whitespace-nowrap ${
              filterChip === 'starred'
                ? 'bg-[#111827] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            Starred
          </button>
          <button
            onClick={() => setFilterChip('actions')}
            className={`px-4 py-1.5 rounded-full transition-all whitespace-nowrap ${
              filterChip === 'actions'
                ? 'bg-[#111827] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
            }`}
          >
            Has actions
          </button>
        </div>

        {/* Section Label */}
        <div className="pt-1 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-slate-400">
            {filteredSessions.length > 0 ? 'Recorded Sessions' : ''}
          </span>
          {filteredSessions.length > 0 && (
            <span className="text-xs text-slate-400">
              {filteredSessions.length} {filteredSessions.length === 1 ? 'meeting' : 'meetings'}
            </span>
          )}
        </div>

        {/* Meeting Cards List OR Clean Empty State */}
        {filteredSessions.length === 0 ? (
          <div className="py-12 px-4 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-[#008751] flex items-center justify-center shadow-inner">
              <Mic className="w-8 h-8" />
            </div>
            <div className="space-y-1 max-w-xs">
              <h3 className="text-base font-bold text-slate-900">
                No court sessions recorded yet
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tap the <strong className="text-slate-800">Record Proceeding</strong> button below to capture court audio with live transcription, speaker diarization, and grounded judicial summaries.
              </p>
            </div>
            <button
              onClick={onStartRecord}
              className="px-5 py-2.5 rounded-full bg-[#008751] hover:bg-[#007043] text-white text-xs font-semibold shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-2"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Record First Session</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSessions.map((session) => {
              const isProcessing = session.status === 'processing';
              const actionCount = session.summary?.action_items?.length || 0;
              const durationMin = Math.max(1, Math.round((session.duration_seconds || 60) / 60));

              // Compute real unique speakers from transcript or summary
              const detectedSpeakers = session.final_transcript?.segments
                ? Array.from(new Set(session.final_transcript.segments.map((s) => s.speaker)))
                : session.summary?.speaker_contributions
                ? session.summary.speaker_contributions.map((c) => c.speaker)
                : ['Speaker'];

              return (
                <div
                  key={session.id}
                  onClick={() => onSelectMeeting(session)}
                  className="bg-white rounded-2xl p-4 border border-slate-100/90 shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer touch-press"
                >
                  {/* Title & Time */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[15px] font-bold text-slate-900 leading-snug truncate">
                      {session.title || 'Court Proceeding'}
                    </h3>
                    <span className="text-xs font-medium text-slate-400 flex-shrink-0">
                      {session.started_at || 'Today'}
                    </span>
                  </div>

                  {/* Body State: Processing or Executive Summary */}
                  {isProcessing ? (
                    <div className="mt-2.5 mb-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-[#008751] mb-1.5">
                        <span className="animate-pulse">Transcribing & Diarizing Proceeding...</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="w-[75%] h-full bg-[#008751] rounded-full animate-pulse" />
                      </div>
                    </div>
                  ) : (
                    session.summary?.executive_summary && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mt-1.5 mb-2.5">
                        {session.summary.executive_summary}
                      </p>
                    )
                  )}

                  {/* Footer: Real Speaker Avatars + Duration + Actions Badge */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center">
                        {detectedSpeakers.slice(0, 4).map((sp, idx) => {
                          const color = speakerColorPalette[idx % speakerColorPalette.length];
                          const initial = sp ? sp[0].toUpperCase() : 'S';
                          return (
                            <div
                              key={idx}
                              title={sp}
                              className={`w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white shadow-xs ${color} ${
                                idx > 0 ? '-ml-1.5' : ''
                              }`}
                            >
                              {initial}
                            </div>
                          );
                        })}
                      </div>
                      <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{durationMin} min</span>
                      </span>
                      {session.has_audio && (
                        <span className="flex items-center gap-1 text-[11px] text-[#008751] bg-emerald-50 px-2 py-0.5 rounded-full font-medium" title="Audio recording available for replay">
                          <Volume2 className="w-3 h-3" />
                          <span>Replay</span>
                        </span>
                      )}
                    </div>

                    {actionCount > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#008751] text-[11px] font-semibold border border-emerald-100">
                        {actionCount} {actionCount === 1 ? 'order' : 'orders'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Record Button */}
      <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none z-30">
        <button
          onClick={onStartRecord}
          className="pointer-events-auto bg-[#008751] hover:bg-[#007043] text-white px-6 py-3 rounded-full flex items-center gap-2 shadow-[0_10px_25px_rgba(0,135,81,0.35)] font-semibold text-sm touch-press cursor-pointer transition-all active:scale-95"
        >
          <Mic className="w-4 h-4 fill-white" />
          <span>Record Proceeding</span>
        </button>
      </div>
    </div>
  );
};

