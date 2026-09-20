import React from 'react';
import type { ActionItem } from '../../types/transcription';
import { CheckSquare, Calendar, User, ExternalLink } from 'lucide-react';

interface ActionItemsProps {
  actionItems: ActionItem[];
  onToggleItem: (actionId: string, completed: boolean) => void;
  onEvidenceClick: (segmentId: string) => void;
}

export const ActionItems: React.FC<ActionItemsProps> = ({
  actionItems,
  onToggleItem,
  onEvidenceClick,
}) => {
  if (!actionItems || actionItems.length === 0) return null;

  return (
    <div className="p-4 rounded-2xl bg-[#0b1610]/70 border border-emerald-500/20 shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-[#008751]/20 border border-[#008751]/30 text-emerald-300">
          <CheckSquare className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-white">Action Items & Tasks</h3>
        <span className="text-[10px] text-emerald-300/60 font-mono">({actionItems.length})</span>
      </div>

      <div className="space-y-2">
        {actionItems.map((item, idx) => (
          <div
            key={item.id || idx}
            className={`p-3 rounded-xl border transition-all ${
              item.completed
                ? 'bg-[#050c08]/50 border-emerald-500/10 opacity-60'
                : 'bg-[#060e0a] border-emerald-500/15 hover:border-emerald-400/40'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={item.completed}
                onChange={(e) => onToggleItem(item.id, e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-emerald-600 bg-[#050c08] text-[#008751] focus:ring-[#008751] focus:ring-offset-[#060d09] cursor-pointer"
              />

              <div className="flex-1 min-w-0">
                <p className={`text-xs sm:text-sm leading-relaxed ${item.completed ? 'line-through text-slate-500' : 'text-slate-100 font-medium'}`}>
                  {item.task}
                </p>

                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {item.assignee && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded text-[10px] font-semibold bg-[#008751]/15 text-emerald-300 border border-[#008751]/30">
                      <User className="w-2.5 h-2.5" />
                      {item.assignee}
                    </span>
                  )}

                  {item.deadline && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      <Calendar className="w-2.5 h-2.5" />
                      {item.deadline}
                    </span>
                  )}

                  {item.evidence_segment_ids && item.evidence_segment_ids.length > 0 && (
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[9px] text-emerald-300/70">Evidence:</span>
                      {item.evidence_segment_ids.map((segId) => (
                        <button
                          key={segId}
                          onClick={() => onEvidenceClick(segId)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white bg-[#008751] hover:bg-[#009b5d] active:scale-95 transition-all touch-press"
                          title={`Jump to segment ${segId}`}
                        >
                          <span>{segId}</span>
                          <ExternalLink className="w-2 h-2" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
