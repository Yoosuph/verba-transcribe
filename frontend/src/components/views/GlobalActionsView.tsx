import React from 'react';
import { ChevronLeft, Gavel, Calendar, Clock, Scale, ArrowRight, Plus } from 'lucide-react';
import type { SessionState } from '../../types/transcription';
import { JudiciaryLogo } from '../common/JudiciaryLogo';

interface GlobalActionsViewProps {
  sessions: SessionState[];
  onBack: () => void;
  onSelectMeeting: (session: SessionState) => void;
  onStartHearing?: () => void;
}

export const GlobalActionsView: React.FC<GlobalActionsViewProps> = ({
  sessions,
  onBack,
  onSelectMeeting,
  onStartHearing,
}) => {
  // Aggregate real judicial orders from all sessions
  const ordersList: Array<{
    orderText: string;
    caseNumber: string;
    court: string;
    judge: string;
    division: string;
    hearingDate: string;
    adjournment?: { date: string; time: string; purpose: string };
    sessionObj: SessionState;
  }> = [];

  sessions.forEach((s) => {
    const caseNum = s.case_info?.case_number || 'JGS/SCA/DTS/CV/018/2026';
    const courtName = s.case_info?.court || 'Sharia Court of Appeal of Jigawa State';
    const judgeName = s.case_info?.judge || 'Hon. Kadi Sani Salihu (Hon. Grand Kadi)';
    const divisionName = s.case_info?.division || 'Dutse Judicial Division';
    const hearingDt = s.case_info?.hearing_date || s.started_at || '21 September 2026';

    if (s.hearing_report && s.hearing_report.orders && s.hearing_report.orders.length > 0) {
      s.hearing_report.orders.forEach((ord) => {
        ordersList.push({
          orderText: ord.order,
          caseNumber: caseNum,
          court: courtName,
          judge: judgeName,
          division: divisionName,
          hearingDate: hearingDt,
          adjournment: s.hearing_report?.next_hearing,
          sessionObj: s,
        });
      });
    } else if (s.summary?.decisions && s.summary.decisions.length > 0) {
      s.summary.decisions.forEach((d) => {
        ordersList.push({
          orderText: d.decision,
          caseNumber: caseNum,
          court: courtName,
          judge: judgeName,
          division: divisionName,
          hearingDate: hearingDt,
          adjournment: undefined,
          sessionObj: s,
        });
      });
    }
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#F8FAF9] text-slate-900 overflow-hidden relative select-none">
      {/* Top Header Control Strip */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-3 pb-3 border-b border-slate-200/80 flex-shrink-0 bg-white/90 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white hover:bg-slate-100 border border-slate-200/90 active:scale-[0.98] transition-all flex items-center justify-center text-slate-700 shadow-xs cursor-pointer"
            title="Back to Cause Docket"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#008751] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
              Judicial Archive · Sharia Court of Appeal
            </span>
            <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight leading-tight mt-0.5">
              Court Orders & Decrees (Hukuncin Kotu)
            </h1>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            {ordersList.length} {ordersList.length === 1 ? 'Order' : 'Orders'} Enforceable
          </span>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 pb-32">
        {ordersList.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-8 text-center max-w-md mx-auto space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] my-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-[#008751] mx-auto shadow-xs">
              <JudiciaryLogo size="sm" variant="crest" lightMode={true} />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                No Judicial Orders on Record Yet
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                When a hearing is transcribed or synthesized, all enforceable pronouncements
                (Hukunci) and adjournment dates will automatically be catalogued here.
              </p>
            </div>

            {onStartHearing && (
              <div className="pt-2">
                <button
                  onClick={onStartHearing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#008751] hover:bg-[#007345] active:scale-[0.98] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Start New Hearing</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          ordersList.map((item, idx) => (
            <article
              key={idx}
              className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:border-emerald-300 transition-all space-y-3.5"
            >
              {/* Header: Court, Division, Suit Number & Date */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#008751] flex items-center justify-center font-bold border border-emerald-200/60 flex-shrink-0">
                    <Gavel className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-slate-900">
                        {item.caseNumber}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60">
                        {item.division}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {item.court} · {item.judge}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-auto text-xs font-medium text-slate-500">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{item.hearingDate}</span>
                </div>
              </div>

              {/* Order Body in Prestigious Dark Forest Box */}
              <div className="p-4 rounded-xl bg-[#082E20] text-white space-y-1.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
                    Enforceable Court Directive (Hukunci #{idx + 1})
                  </span>
                  <span className="text-[10px] font-mono text-emerald-200/60">
                    Binding on Litigants
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-semibold leading-relaxed text-white">
                  {item.orderText}
                </p>
              </div>

              {/* Adjournment info if present */}
              {item.adjournment && item.adjournment.date && (
                <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs flex items-center gap-2 text-amber-950 font-medium">
                  <Clock className="w-4 h-4 text-amber-800 flex-shrink-0" />
                  <span>
                    Adjourned to <strong className="font-bold">{item.adjournment.date}</strong> at{' '}
                    <strong>{item.adjournment.time}</strong> for {item.adjournment.purpose}
                  </span>
                </div>
              )}

              {/* Footer action */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400 italic">
                  Certified from recorded hearing proceedings
                </span>
                <button
                  onClick={() => onSelectMeeting(item.sessionObj)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#008751] active:scale-[0.98] text-xs font-bold transition-all cursor-pointer border border-emerald-200/80 shadow-xs"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>View Full Report</span>
                  <ArrowRight className="w-3 h-3 ml-0.5" />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};
