import React from 'react';
import type { MeetingSummary } from '../../types/transcription';
import { KeyPoints } from './KeyPoints';
import { Decisions } from './Decisions';
import { ActionItems } from './ActionItems';
import { Questions } from './Questions';
import { SpeakerContributions } from './SpeakerContributions';
import { Sparkles, FileText, CheckCircle2 } from 'lucide-react';

interface SummaryPanelProps {
  summary: MeetingSummary;
  onEvidenceClick: (segmentId: string) => void;
  onToggleActionItem: (actionId: string, completed: boolean) => void;
  onRenameSpeaker: (speaker: string) => void;
}

export const SummaryPanel: React.FC<SummaryPanelProps> = ({
  summary,
  onEvidenceClick,
  onToggleActionItem,
  onRenameSpeaker,
}) => {
  return (
    <div className="flex flex-col h-full bg-[#09120c]/85 rounded-3xl border border-emerald-500/20 overflow-hidden shadow-2xl backdrop-blur-xl ring-1 ring-white/5">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-500/15 bg-[#0b1610]/70">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-[#008751]/20 border border-[#008751]/30 text-emerald-300">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-xs font-bold tracking-wide uppercase text-white">
              Grounded Summary
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="w-3 h-3" />
          <span>Evidence Verified</span>
        </div>
      </div>

      {/* Content Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 min-h-[360px]">
        {/* Executive Summary Card */}
        <div className="p-4 rounded-2xl bg-gradient-to-b from-[#008751]/15 to-[#0b1610]/80 border border-emerald-500/25 shadow-md">
          <div className="flex items-center gap-1.5 mb-2 text-emerald-300">
            <FileText className="w-3.5 h-3.5" />
            <h3 className="text-xs font-bold tracking-wider uppercase text-white">
              Executive Summary
            </h3>
          </div>
          <p className="text-slate-100 text-xs sm:text-sm leading-relaxed font-normal">
            {summary.executive_summary}
          </p>
        </div>

        <KeyPoints keyPoints={summary.key_points} />
        <Decisions decisions={summary.decisions} onEvidenceClick={onEvidenceClick} />
        <ActionItems
          actionItems={summary.action_items}
          onToggleItem={onToggleActionItem}
          onEvidenceClick={onEvidenceClick}
        />
        <SpeakerContributions
          contributions={summary.speaker_contributions}
          onRenameSpeaker={onRenameSpeaker}
        />
        <Questions questions={summary.questions} />
      </div>
    </div>
  );
};
