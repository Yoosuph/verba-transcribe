import React, { useState } from 'react';
import type { TranscriptSegment as SegmentType } from '../../types/transcription';
import { SpeakerBadge } from './SpeakerBadge';
import { Timestamp } from './Timestamp';
import { Copy, Check, Hash } from 'lucide-react';

interface TranscriptSegmentProps {
  segment: SegmentType;
  isHighlighted?: boolean;
  onRenameSpeaker?: (speaker: string) => void;
}

export const TranscriptSegment: React.FC<TranscriptSegmentProps> = ({
  segment,
  isHighlighted = false,
  onRenameSpeaker,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(`${segment.speaker} [${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s]: ${segment.text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id={segment.id}
      className={`group relative p-3.5 rounded-2xl border transition-all duration-200 ${
        isHighlighted
          ? 'bg-emerald-500/20 border-emerald-400 shadow-xl shadow-emerald-950 ring-2 ring-emerald-400'
          : 'bg-[#0b1610]/70 border-emerald-500/15 hover:bg-[#102018] hover:border-emerald-500/30'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center text-[10px] font-mono text-emerald-400/80 bg-[#050c08] px-1.5 py-0.5 rounded border border-emerald-500/20">
            <Hash className="w-2.5 h-2.5 mr-0.5" />
            {segment.id}
          </span>

          <SpeakerBadge speaker={segment.speaker} onEdit={onRenameSpeaker} />

          <div className="flex items-center gap-1">
            <Timestamp seconds={segment.start} />
            <span className="text-slate-600 text-xs">→</span>
            <Timestamp seconds={segment.end} />
          </div>

          {segment.language && (
            <span className="text-[9px] uppercase font-bold tracking-wider text-emerald-300 bg-emerald-500/10 px-1.5 py-0.2 rounded-full border border-emerald-500/25">
              {segment.language}
            </span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="opacity-70 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded touch-press"
          title="Copy segment text"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      <p className="text-slate-100 text-sm sm:text-base leading-relaxed font-normal selection:bg-emerald-500/30 selection:text-white">
        {segment.text}
      </p>
    </div>
  );
};
