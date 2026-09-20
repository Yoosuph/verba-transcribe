import React from 'react';
import type { SpeakerContribution } from '../../types/transcription';
import { SpeakerBadge } from '../transcript/SpeakerBadge';
import { Users } from 'lucide-react';

interface SpeakerContributionsProps {
  contributions: SpeakerContribution[];
  onRenameSpeaker?: (speaker: string) => void;
}

export const SpeakerContributions: React.FC<SpeakerContributionsProps> = ({
  contributions,
  onRenameSpeaker,
}) => {
  if (!contributions || contributions.length === 0) return null;

  return (
    <div className="p-4 rounded-2xl bg-[#0b1610]/70 border border-emerald-500/20 shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-[#008751]/20 border border-[#008751]/30 text-emerald-300">
          <Users className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-white">Speaker Contributions</h3>
        <span className="text-[10px] text-emerald-300/60 font-mono">({contributions.length})</span>
      </div>

      <div className="space-y-2">
        {contributions.map((item, idx) => (
          <div
            key={idx}
            className="p-3 rounded-xl bg-[#060e0a] border border-emerald-500/15 space-y-1.5 hover:border-emerald-400/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <SpeakerBadge speaker={item.speaker} onEdit={onRenameSpeaker} />
            </div>
            <p className="text-slate-200 text-xs sm:text-sm leading-relaxed">
              {item.summary}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
