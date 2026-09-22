import React from 'react';
import {
  ChevronLeft,
  BadgeCheck,
  ListChecks,
  Calendar,
  CheckCircle2,
  ArrowRight,
  User,
  Inbox,
} from 'lucide-react';
import type { SessionState } from '../../types/transcription';

interface GlobalActionsViewProps {
  sessions: SessionState[];
  onBack: () => void;
  onSelectMeeting: (session: SessionState) => void;
  onStartRecord?: () => void;
}

interface AggregatedItem {
  id: string;
  kind: 'decision' | 'action';
  text: string;
  meetingTitle: string;
  meetingDate?: string;
  sessionObj: SessionState;
  completed?: boolean;
  assignee?: string;
}

export const GlobalActionsView: React.FC<GlobalActionsViewProps> = ({
  sessions,
  onBack,
  onSelectMeeting,
  onStartRecord,
}) => {
  // Aggregate decisions and action items across all sessions
  const items: AggregatedItem[] = [];
  sessions.forEach((s) => {
    const meetingTitle = s.title || 'Untitled Meeting';
    const meetingDate = s.started_at;

    s.summary?.decisions?.forEach((d) => {
      items.push({
        id: `${s.id}-decision-${d.id}`,
        kind: 'decision',
        text: d.decision,
        meetingTitle,
        meetingDate,
        sessionObj: s,
      });
    });

    s.summary?.action_items?.forEach((a) => {
      items.push({
        id: `${s.id}-action-${a.id}`,
        kind: 'action',
        text: a.task,
        meetingTitle,
        meetingDate,
        sessionObj: s,
        completed: a.completed,
        assignee: a.assignee,
      });
    });
  });

  const openActions = items.filter((i) => i.kind === 'action' && !i.completed).length;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F8FAF9] text-slate-900 overflow-hidden relative select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-3 pb-3 border-b border-slate-200/80 flex-shrink-0 bg-white/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white hover:bg-slate-100 border border-slate-200/90 active:scale-[0.98] transition-all flex items-center justify-center text-slate-700 shadow-xs cursor-pointer"
            title="Back to all meetings"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#008751] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
              Across All Meetings
            </span>
            <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-tight mt-0.5">
              Decisions &amp; Action Items
            </h1>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xl font-black text-[#008751] leading-none">{items.length}</div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            {openActions > 0 ? `${openActions} open` : 'All clear'}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 pb-28 space-y-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mb-4 shadow-xs">
              <Inbox className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-800">Nothing tracked yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
              Decisions and action items extracted from your meetings will appear here.
            </p>
            {onStartRecord && (
              <button
                onClick={onStartRecord}
                className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#008751] hover:bg-[#007043] text-white text-xs font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                Record a Meeting
              </button>
            )}
          </div>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold border flex-shrink-0 ${
                      item.kind === 'decision'
                        ? 'bg-emerald-50 text-[#008751] border-emerald-200/60'
                        : 'bg-amber-50 text-amber-700 border-amber-200/60'
                    }`}
                  >
                    {item.kind === 'decision' ? <BadgeCheck className="w-4 h-4" /> : <ListChecks className="w-4 h-4" />}
                  </div>
                  <div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        item.kind === 'decision'
                          ? 'text-emerald-800 bg-emerald-50 border-emerald-200/60'
                          : 'text-amber-800 bg-amber-50 border-amber-200/60'
                      }`}
                    >
                      {item.kind === 'decision' ? 'Decision' : 'Action Item'}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium ml-2">{item.meetingTitle}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                  {item.assignee && (
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" /> {item.assignee}
                    </span>
                  )}
                  {item.completed && (
                    <span className="inline-flex items-center gap-1 text-[#008751] font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Done
                    </span>
                  )}
                  {item.meetingDate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" /> {item.meetingDate}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-relaxed">{item.text}</p>

              <div className="flex items-center justify-end pt-1">
                <button
                  onClick={() => onSelectMeeting(item.sessionObj)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#008751] active:scale-[0.98] text-xs font-bold transition-all cursor-pointer border border-emerald-200/80 shadow-xs"
                >
                  Open Meeting
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};
