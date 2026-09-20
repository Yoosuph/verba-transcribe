import React from 'react';
import { ListChecks } from 'lucide-react';

interface KeyPointsProps {
  keyPoints: string[];
}

export const KeyPoints: React.FC<KeyPointsProps> = ({ keyPoints }) => {
  if (!keyPoints || keyPoints.length === 0) return null;

  return (
    <div className="p-4 rounded-2xl bg-[#0b1610]/70 border border-emerald-500/20 shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-[#008751]/20 border border-[#008751]/30 text-emerald-300">
          <ListChecks className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-white">Key Points</h3>
        <span className="text-[10px] text-emerald-300/60 font-mono">({keyPoints.length})</span>
      </div>

      <ul className="space-y-2">
        {keyPoints.map((point, idx) => (
          <li key={idx} className="flex items-start gap-2.5 text-slate-200 text-xs sm:text-sm leading-relaxed">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
