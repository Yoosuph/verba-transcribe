import React from 'react';
import { User, Edit2 } from 'lucide-react';

interface SpeakerBadgeProps {
  speaker: string;
  onEdit?: (speaker: string) => void;
  className?: string;
}

const SPEAKER_PALETTE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'Speaker 1': { bg: 'bg-[#008751]/15', text: 'text-emerald-300', border: 'border-[#008751]/40', dot: 'bg-emerald-400' },
  'Speaker 2': { bg: 'bg-teal-500/15', text: 'text-teal-300', border: 'border-teal-500/40', dot: 'bg-teal-400' },
  'Speaker 3': { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/40', dot: 'bg-amber-400' },
  'Speaker 4': { bg: 'bg-sky-500/15', text: 'text-sky-300', border: 'border-sky-500/40', dot: 'bg-sky-400' },
  'Speaker 5': { bg: 'bg-emerald-400/15', text: 'text-emerald-200', border: 'border-emerald-400/40', dot: 'bg-emerald-300' },
  'Speaker 6': { bg: 'bg-lime-500/15', text: 'text-lime-300', border: 'border-lime-500/40', dot: 'bg-lime-400' },
  'Speaker 7': { bg: 'bg-cyan-500/15', text: 'text-cyan-300', border: 'border-cyan-500/40', dot: 'bg-cyan-400' },
  'Speaker 8': { bg: 'bg-white/10', text: 'text-white', border: 'border-white/25', dot: 'bg-white' },
};

export const SpeakerBadge: React.FC<SpeakerBadgeProps> = ({ speaker, onEdit, className = '' }) => {
  const color = SPEAKER_PALETTE[speaker] || {
    bg: 'bg-[#008751]/15',
    text: 'text-emerald-300',
    border: 'border-[#008751]/40',
    dot: 'bg-emerald-400',
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${color.bg} ${color.text} ${color.border} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
      <User className="w-3 h-3" />
      <span>{speaker}</span>
      {onEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(speaker);
          }}
          title="Rename Speaker"
          className="ml-1 opacity-70 hover:opacity-100 p-0.5 hover:bg-white/10 rounded transition-all touch-press"
        >
          <Edit2 className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
};
