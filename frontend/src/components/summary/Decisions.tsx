import React from 'react';
import type { DecisionItem } from '../../types/transcription';
import { Gavel, ExternalLink } from 'lucide-react';

interface DecisionsProps {
  decisions: DecisionItem[];
  onEvidenceClick: (segmentId: string) => void;
}

export const Decisions: React.FC<DecisionsProps> = ({ decisions, onEvidenceClick }) => {
  if (!decisions || decisions.length === 0) return null;

  return (
    <div className="p-4 rounded-2xl bg-[#0b1610]/70 border border-emerald-500/20 shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-[#008751]/20 border border-[#008751]/30 text-emerald-300">
          <Gavel className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-white">Agreed Decisions</h3>
        <span className="text-[10px] text-emerald-300/60 font-mono">({decisions.length})</span>
      </div>

      <div className="space-y-2.5">
        {decisions.map((item, idx) => (
          <div
            key={item.id || idx}
            className="p-3 rounded-xl bg-[#060e0a] border border-emerald-500/15 hover:border-emerald-400/40 transition-colors"
          >
            <p className="text-white text-xs sm:text-sm font-medium leading-relaxed mb-2">
              {item.decision}
            </p>

            {item.evidence_segment_ids && item.evidence_segment_ids.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-emerald-500/10">
                <span className="text-[10px] text-emerald-300/70 font-medium">Evidence:</span>
                {item.evidence_segment_ids.map((segId) => (
                  <button
                    key={segId}
                    onClick={() => onEvidenceClick(segId)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold text-white bg-[#008751] hover:bg-[#009b5d] active:scale-95 transition-all touch-press shadow-sm"
                    title={`Jump to transcript segment ${segId}`}
                  >
                    <span>{segId}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
