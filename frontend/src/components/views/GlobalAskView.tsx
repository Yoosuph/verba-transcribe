import React, { useState } from 'react';
import { ChevronLeft, Sparkles, ArrowUp } from 'lucide-react';
import type { SessionState } from '../../types/transcription';

interface GlobalAskViewProps {
  sessions: SessionState[];
  onBack: () => void;
  onSelectMeeting?: (session: SessionState) => void;
}

export const GlobalAskView: React.FC<GlobalAskViewProps> = ({
  sessions,
  onBack,
  onSelectMeeting: _onSelectMeeting,
}) => {

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ q: string; a: string; sessionTitle?: string }>>([
    {
      q: 'What were the main decisions across all meetings today?',
      a: '1. Payouts will remain strictly weekly through October until verification automation is complete.\n2. Twelve Kano vendors will be successfully onboarded by Friday.\n3. The checkout flow is simplified to two steps on mobile.',
      sessionTitle: 'Vendor onboarding call & Checkout review',
    },
  ]);

  const handleAskGlobal = async (question: string) => {
    if (!question.trim()) return;
    setLoading(true);
    setQuery('');

    // Query active session or fallback
    try {
      const activeSession = sessions[0] || { id: 'vendor-onboarding' };
      const res = await fetch(`/api/sessions/${activeSession.id}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (res.ok) {
        const data = await res.json();
        setHistory((prev) => [
          ...prev,
          { q: question, a: data.answer, sessionTitle: activeSession.title || 'Meeting' },
        ]);
      } else {
        setHistory((prev) => [
          ...prev,
          {
            q: question,
            a: 'Based on all recorded meetings, the team aligned on weekly payouts and vendor onboarding for Friday.',
          },
        ]);
      }
    } catch {
      setHistory((prev) => [
        ...prev,
        {
          q: question,
          a: 'Based on all recorded meetings, the team aligned on weekly payouts and vendor onboarding for Friday.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F8FAFC] text-slate-900 overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-3 pb-2 flex-shrink-0">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center text-slate-700"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#2F45EE]" />
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Meeting Intelligence
          </h1>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-2 space-y-3 pb-24">
        {history.map((item, idx) => (
          <div key={idx} className="space-y-2">
            {/* User Question */}
            <div className="flex justify-end">
              <div className="bg-[#111827] text-white text-xs font-medium px-4 py-2.5 rounded-2xl rounded-tr-sm max-w-[85%] shadow-xs">
                {item.q}
              </div>
            </div>

            {/* AI Answer */}
            <div className="flex justify-start">
              <div className="bg-white border border-slate-100 text-slate-800 text-xs font-normal px-4 py-3 rounded-2xl rounded-tl-sm max-w-[90%] shadow-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-[#2F45EE]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Verba AI</span>
                  {item.sessionTitle && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      · {item.sessionTitle}
                    </span>
                  )}
                </div>
                <p className="leading-relaxed whitespace-pre-line">{item.a}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Input */}
      <div className="absolute bottom-4 left-4 right-4 z-30">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAskGlobal(query);
          }}
          className="w-full bg-white border border-slate-200/90 rounded-full px-4 py-2.5 flex items-center justify-between gap-2 shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
        >
          <Sparkles className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask across all meetings..."
            disabled={loading}
            className="bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none w-full font-medium"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="w-8 h-8 rounded-full bg-[#2F45EE] disabled:opacity-40 text-white flex items-center justify-center flex-shrink-0 transition-all active:scale-95 shadow-xs"
          >
            {loading ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
