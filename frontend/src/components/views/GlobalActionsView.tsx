import React from 'react';
import { ChevronLeft, Check } from 'lucide-react';
import type { SessionState } from '../../types/transcription';


interface GlobalActionsViewProps {
  sessions: SessionState[];
  onBack: () => void;
  onSelectMeeting: (session: SessionState) => void;
}

export const GlobalActionsView: React.FC<GlobalActionsViewProps> = ({
  sessions,
  onBack,
  onSelectMeeting,
}) => {
  // Aggregate all action items from all sessions
  const allActions = sessions.flatMap((s) =>
    (s.summary?.action_items || []).map((act) => ({
      ...act,
      sessionTitle: s.title || 'Meeting',
      sessionObj: s,
    }))
  );

  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFC] text-slate-900 overflow-hidden relative">
      {/* Top Header */}
      <div className="flex items-center gap-3 px-5 pt-3 pb-2 flex-shrink-0">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center text-slate-700"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
          All Action Items
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3 pb-24">
        {allActions.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No action items found yet.
          </div>
        ) : (
          allActions.map((act, idx) => (
            <div
              key={idx}
              onClick={() => onSelectMeeting(act.sessionObj)}
              className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs hover:border-slate-200 transition-all cursor-pointer space-y-2 touch-press"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center mt-0.5 ${
                      act.completed
                        ? 'bg-[#10B981] text-white shadow-xs'
                        : 'border-2 border-slate-300'
                    }`}
                  >
                    {act.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        act.completed ? 'text-slate-400 line-through' : 'text-slate-900'
                      }`}
                    >
                      {act.task}
                    </p>
                    <span className="text-xs text-slate-400">
                      From: {act.sessionTitle}
                    </span>
                  </div>
                </div>

                {act.deadline && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                    {act.deadline}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-50">
                <span className="text-slate-500 font-medium">
                  Assignee: <span className="text-slate-800 font-bold">{act.assignee || 'Unassigned'}</span>
                </span>
                <span className="text-[#2F45EE] font-semibold hover:underline">
                  View Meeting →
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
