import React from 'react';
import { HelpCircle } from 'lucide-react';

interface QuestionsProps {
  questions: string[];
}

export const Questions: React.FC<QuestionsProps> = ({ questions }) => {
  if (!questions || questions.length === 0) return null;

  return (
    <div className="p-4 rounded-2xl bg-[#0b1610]/70 border border-emerald-500/20 shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300">
          <HelpCircle className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-white">Questions Raised</h3>
        <span className="text-[10px] text-emerald-300/60 font-mono">({questions.length})</span>
      </div>

      <ul className="space-y-1.5">
        {questions.map((q, idx) => (
          <li key={idx} className="flex items-start gap-2 text-slate-200 text-xs sm:text-sm leading-relaxed">
            <span className="text-amber-400 font-bold mt-0.5 text-xs">?</span>
            <span>{q}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
