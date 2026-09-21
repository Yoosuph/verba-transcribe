import React from 'react';
import {
  Menu,
  FileText,
  Gavel,
  Scale,
} from 'lucide-react';

export type AppPage = 'meetings' | 'live' | 'transcript' | 'summary' | 'actions' | 'report';

interface ButtonPlateProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  hasSession: boolean;
  actionCount?: number;
  theme?: 'light' | 'royal';
}

export const ButtonPlate: React.FC<ButtonPlateProps> = ({
  activePage,
  onNavigate,
  hasSession,
  theme = 'light',
}) => {
  const isRoyal = theme === 'royal';

  const activeIndex =
    activePage === 'meetings'
      ? 0
      : activePage === 'transcript' || activePage === 'summary'
      ? 1
      : activePage === 'report'
      ? 2
      : activePage === 'actions'
      ? 3
      : -1;

  return (
    <div className="w-full px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 z-50 flex-shrink-0 select-none no-print">
      <nav
        className={`w-full rounded-2xl p-1.5 grid grid-cols-4 gap-1 shadow-[0_4px_24px_rgba(0,0,0,0.07)] transition-all duration-300 relative ${
          isRoyal
            ? 'bg-[#042A1D]/90 backdrop-blur-xl border border-emerald-500/30 text-white'
            : 'bg-white/95 backdrop-blur-xl border border-slate-200/90 text-slate-700'
        }`}
      >
        {/* Precise Sliding Pill Indicator with zero-drift math */}
        {activeIndex >= 0 && (
          <div
            className={`absolute top-1.5 bottom-1.5 rounded-xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-sm pointer-events-none ${
              isRoyal
                ? 'bg-white shadow-emerald-950/20'
                : 'bg-[#008751] shadow-emerald-800/25'
            }`}
            style={{
              width: 'calc((100% - 24px) / 4)',
              left: '6px',
              transform: `translateX(calc(${activeIndex} * (100% + 4px)))`,
            }}
          />
        )}

        {/* 1. Cause Docket / Hearings */}
        <button
          onClick={() => onNavigate('meetings')}
          className={`relative z-10 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 cursor-pointer active:scale-95 ${
            activePage === 'meetings'
              ? isRoyal
                ? 'text-[#008751] font-bold'
                : 'text-white font-bold'
              : isRoyal
              ? 'text-white/70 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Cause Docket & Proceedings"
        >
          <Menu
            className={`w-4 h-4 transition-transform duration-200 ${
              activePage === 'meetings' ? 'scale-110' : 'scale-100'
            }`}
          />
          <span className="text-[11px] mt-1 tracking-tight font-semibold truncate">
            Hearings
          </span>
        </button>

        {/* 2. Court Record & Audio */}
        <button
          onClick={() => onNavigate('transcript')}
          disabled={!hasSession}
          className={`relative z-10 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 ${
            !hasSession
              ? 'opacity-30 cursor-not-allowed'
              : 'cursor-pointer active:scale-95'
          } ${
            activePage === 'transcript' || activePage === 'summary'
              ? isRoyal
                ? 'text-[#008751] font-bold'
                : 'text-white font-bold'
              : isRoyal
              ? 'text-white/70 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Court Record & Audio Playback"
        >
          <FileText
            className={`w-4 h-4 transition-transform duration-200 ${
              activePage === 'transcript' || activePage === 'summary' ? 'scale-110' : 'scale-100'
            }`}
          />
          <span className="text-[11px] mt-1 tracking-tight font-semibold truncate">
            Record
          </span>
        </button>

        {/* 3. Judicial Hearing Report */}
        <button
          onClick={() => onNavigate('report')}
          disabled={!hasSession}
          className={`relative z-10 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 ${
            !hasSession
              ? 'opacity-30 cursor-not-allowed'
              : 'cursor-pointer active:scale-95'
          } ${
            activePage === 'report'
              ? isRoyal
                ? 'text-[#008751] font-bold'
                : 'text-white font-bold'
              : isRoyal
              ? 'text-white/70 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Judicial Hearing Report & PDF / Word Export"
        >
          <Scale
            className={`w-4 h-4 transition-transform duration-200 ${
              activePage === 'report' ? 'scale-110' : 'scale-100'
            }`}
          />
          <span className="text-[11px] mt-1 tracking-tight font-semibold truncate">
            Report
          </span>
        </button>

        {/* 4. Court Orders & Decrees */}
        <button
          onClick={() => onNavigate('actions')}
          className={`relative z-10 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 cursor-pointer active:scale-95 ${
            activePage === 'actions'
              ? isRoyal
                ? 'text-[#008751] font-bold'
                : 'text-white font-bold'
              : isRoyal
              ? 'text-white/70 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Enforceable Court Orders & Adjournments"
        >
          <Gavel
            className={`w-4 h-4 transition-transform duration-200 ${
              activePage === 'actions' ? 'scale-110' : 'scale-100'
            }`}
          />
          <span className="text-[11px] mt-1 tracking-tight font-semibold truncate">
            Orders
          </span>
        </button>
      </nav>
    </div>
  );
};
