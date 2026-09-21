import React from 'react';
import { ChevronLeft, Gavel, Calendar, Clock, Scale, ExternalLink } from 'lucide-react';
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
  // Aggregate real judicial orders from all sessions
  const ordersList: Array<{
    orderText: string;
    sourceTime?: string;
    caseNumber: string;
    court: string;
    judge: string;
    hearingDate: string;
    adjournment?: { date: string; time: string; purpose: string };
    sessionObj: SessionState;
  }> = [];

  sessions.forEach((s) => {
    const caseNum = s.case_info?.case_number || 'JGS/SCA/DTS/CV/018/2026';
    const courtName = s.case_info?.court || 'Sharia Court of Appeal of Jigawa State';
    const judgeName = s.case_info?.judge || 'Hon. Kadi Sani Salihu (Hon. Grand Kadi)';
    const hearingDt = s.case_info?.hearing_date || s.started_at || '21 September 2026';

    if (s.hearing_report && s.hearing_report.orders && s.hearing_report.orders.length > 0) {
      s.hearing_report.orders.forEach((ord) => {
        ordersList.push({
          orderText: ord.order,
          sourceTime: undefined,
          caseNumber: caseNum,
          court: courtName,
          judge: judgeName,
          hearingDate: hearingDt,
          adjournment: s.hearing_report?.next_hearing,
          sessionObj: s,
        });
      });
    } else if (s.summary?.decisions && s.summary.decisions.length > 0) {
      s.summary.decisions.forEach((d) => {
        ordersList.push({
          orderText: d.decision,
          sourceTime: undefined,
          caseNumber: caseNum,
          court: courtName,
          judge: judgeName,
          hearingDate: hearingDt,
          adjournment: undefined,
          sessionObj: s,
        });
      });
    }
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F8FAFC] text-slate-900 overflow-hidden relative">
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-slate-200/80 flex-shrink-0 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center text-slate-700 cursor-pointer"
            title="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#008751] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
              Judicial Archive
            </span>
            <h1 className="text-base font-black text-slate-900 tracking-tight leading-tight">
              Court Orders & Decrees (Hukuncin Kotu)
            </h1>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            {ordersList.length} {ordersList.length === 1 ? 'Order' : 'Orders'} On Record
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 pb-28">
        {ordersList.length === 0 ? (
          <div className="text-center py-16 px-6 max-w-sm mx-auto space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-[#008751] mx-auto shadow-xs">
              <Gavel className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">No Court Orders on Record Yet</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              When a hearing is recorded or analyzed, binding judicial pronouncements (Hukunci) and adjournment orders will be catalogued here from the proceedings record.
            </p>
          </div>
        ) : (
          ordersList.map((item, idx) => (
            <article
              key={idx}
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:border-[#008751]/40 transition-all space-y-3"
            >
              {/* Header: Court & Suit */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-[#008751]">
                    <Gavel className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-900 block">
                      {item.caseNumber}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {item.court} • {item.judge}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-auto text-[11px] text-slate-500">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{item.hearingDate}</span>
                </div>
              </div>

              {/* Order Body */}
              <div className="p-3.5 rounded-xl bg-[#082E20] text-white space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                    Enforceable Court Directive (Hukunci)
                  </span>
                </div>
                <p className="text-xs font-semibold leading-relaxed text-white">
                  {item.orderText}
                </p>
              </div>

              {/* Adjournment info if present */}
              {item.adjournment && item.adjournment.date && (
                <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/60 text-xs flex items-center gap-2 text-amber-950 font-medium">
                  <Clock className="w-3.5 h-3.5 text-amber-800 flex-shrink-0" />
                  <span>
                    Adjourned to <strong className="font-bold">{item.adjournment.date}</strong> at{' '}
                    <strong>{item.adjournment.time}</strong> for {item.adjournment.purpose}
                  </span>
                </div>
              )}

              {/* Footer action */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <span className="text-[11px] text-slate-400 italic">
                  Certified from recorded hearing proceedings
                </span>
                <button
                  onClick={() => onSelectMeeting(item.sessionObj)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#008751] hover:text-[#007043] cursor-pointer"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>View Full Report</span>
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};
