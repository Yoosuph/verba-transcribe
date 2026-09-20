import React, { useState, useMemo } from 'react';
import type { FinalTranscriptData } from '../../types/transcription';
import { TranscriptSegment } from './TranscriptSegment';
import { Search, Globe, Filter, Languages } from 'lucide-react';

interface FinalTranscriptProps {
  finalTranscript: FinalTranscriptData;
  highlightedSegmentId: string | null;
  onRenameSpeaker: (speaker: string) => void;
  onTranslate?: () => void;
  isTranslating?: boolean;
}

export const FinalTranscript: React.FC<FinalTranscriptProps> = ({
  finalTranscript,
  highlightedSegmentId,
  onRenameSpeaker,
  onTranslate,
  isTranslating = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('all');

  const uniqueSpeakers = useMemo(() => {
    const set = new Set<string>();
    finalTranscript.segments.forEach((s) => set.add(s.speaker));
    return Array.from(set);
  }, [finalTranscript]);

  const filteredSegments = useMemo(() => {
    return finalTranscript.segments.filter((seg) => {
      const matchesSearch = searchQuery.trim() === '' ||
        seg.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        seg.speaker.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSpeaker = selectedSpeaker === 'all' || seg.speaker === selectedSpeaker;
      return matchesSearch && matchesSpeaker;
    });
  }, [finalTranscript, searchQuery, selectedSpeaker]);

  return (
    <div className="flex flex-col h-full bg-[#09120c]/85 rounded-3xl border border-emerald-500/20 overflow-hidden shadow-2xl backdrop-blur-xl ring-1 ring-white/5">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col gap-2.5 p-3.5 border-b border-emerald-500/15 bg-[#0b1610]/70">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold tracking-wide uppercase text-white">
              Final Transcript
            </h2>
            <span className="text-[10px] font-mono text-emerald-300 bg-[#050c08] px-2 py-0.5 rounded-full border border-emerald-500/20">
              {finalTranscript.segments.length} segments
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {finalTranscript.language && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                <Globe className="w-2.5 h-2.5" />
                <span>{finalTranscript.language}</span>
              </span>
            )}

            {onTranslate && (
              <button
                onClick={onTranslate}
                disabled={isTranslating}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-[#008751] hover:bg-[#009b5d] active:scale-95 border border-white/20 rounded-lg transition-all touch-press shadow"
                title="Translate Hausa segments to English"
              >
                <Languages className="w-3 h-3" />
                <span>{isTranslating ? 'Translating...' : 'Translate'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400/70" />
            <input
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#050c08] border border-emerald-500/20 focus:border-emerald-400 rounded-xl text-xs text-white placeholder:text-slate-500 outline-none transition-all"
            />
          </div>

          {uniqueSpeakers.length > 1 && (
            <div className="flex items-center gap-1">
              <Filter className="w-3 h-3 text-emerald-400" />
              <select
                value={selectedSpeaker}
                onChange={(e) => setSelectedSpeaker(e.target.value)}
                aria-label="Filter by speaker"
                className="bg-[#050c08] border border-emerald-500/20 rounded-xl px-2 py-1.5 text-xs text-emerald-300 outline-none focus:border-emerald-400"
              >
                <option value="all">All Speakers ({uniqueSpeakers.length})</option>
                {uniqueSpeakers.map((spk) => (
                  <option key={spk} value={spk}>
                    {spk}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Segments Stream */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 min-h-[360px]">
        {filteredSegments.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-xs">
            No matching segments found.
          </div>
        ) : (
          filteredSegments.map((seg) => (
            <TranscriptSegment
              key={seg.id}
              segment={seg}
              isHighlighted={highlightedSegmentId === seg.id}
              onRenameSpeaker={onRenameSpeaker}
            />
          ))
        )}
      </div>
    </div>
  );
};
