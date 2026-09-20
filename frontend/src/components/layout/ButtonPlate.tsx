import React from 'react';
import {
  Menu,
  FileText,
  CheckSquare,
} from 'lucide-react';

export type AppPage = 'meetings' | 'live' | 'transcript' | 'summary' | 'actions';

interface ButtonPlateProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  hasSession: boolean;
  actionCount: number;
  theme?: 'light' | 'royal';
}

export const ButtonPlate: React.FC<ButtonPlateProps> = ({
  activePage,
  onNavigate,
  hasSession,
  actionCount,
  theme = 'light',
}) => {
  const isRoyal = theme === 'royal';

  const activeIndex =
    activePage === 'meetings'
      ? 0
      : activePage === 'transcript' || activePage === 'summary'
      ? 1
      : activePage === 'actions'
      ? 2
      : -1;

  return (
    <div className="w-full px-4 pb-3 pt-1 z-50 flex-shrink-0 select-none">
      <nav
        className={`w-full rounded-2xl p-1.5 flex items-center justify-between gap-1 shadow-xl transition-all duration-300 relative ${
          isRoyal
            ? 'bg-white/15 backdrop-blur-xl border border-white/20 text-white'
            : 'bg-white/95 backdrop-blur-xl border border-slate-200/80 text-slate-700 shadow-slate-200/50'
        }`}
      >
        {/* Fluid Animated Sliding Pill Indicator */}
        {activeIndex >= 0 && (
          <div
            className={`absolute top-1.5 bottom-1.5 rounded-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-md pointer-events-none ${
              isRoyal
                ? 'bg-white shadow-emerald-950/20'
                : 'bg-[#008751] shadow-emerald-700/25'
            }`}
            style={{
              width: 'calc((100% - 12px) / 3)',
              left: '6px',
              transform: `translateX(calc(${activeIndex} * (100% + 4px)))`,
            }}
          />
        )}

        {/* 1. Meetings */}
        <button
          onClick={() => onNavigate('meetings')}
          className={`relative z-10 flex-1 flex flex-col items-center justify-center py-2 px-2 rounded-xl transition-all duration-200 touch-press ${
            activePage === 'meetings'
              ? isRoyal
                ? 'text-[#008751] font-bold'
                : 'text-white font-bold'
              : isRoyal
              ? 'text-white/75 hover:text-white'
              : 'text-slate-500 hover:text-slate-900'
          }`}
          title="Court Proceedings"
        >
          <Menu className={`w-4 h-4 transition-transform duration-200 ${activePage === 'meetings' ? 'scale-110' : 'scale-100'}`} />
          <span className="text-[11px] mt-1 tracking-tight font-medium">
            Proceedings
          </span>
        </button>

        {/* 2. Transcript & Notes */}
        <button
          onClick={() => onNavigate('transcript')}
          disabled={!hasSession}
          className={`relative z-10 flex-1 flex flex-col items-center justify-center py-2 px-2 rounded-xl transition-all duration-200 touch-press ${
            activePage === 'transcript' || activePage === 'summary'
              ? isRoyal
                ? 'text-[#008751] font-bold'
                : 'text-white font-bold'
              : !hasSession
              ? 'opacity-35 cursor-not-allowed'
              : isRoyal
              ? 'text-white/75 hover:text-white'
              : 'text-slate-500 hover:text-slate-900'
          }`}
          title="Court Transcript & Record"
        >
          <FileText className={`w-4 h-4 transition-transform duration-200 ${activePage === 'transcript' || activePage === 'summary' ? 'scale-110' : 'scale-100'}`} />
          <span className="text-[11px] mt-1 tracking-tight font-medium">
            Transcript
          </span>
        </button>

        {/* 3. Actions */}
        <button
          onClick={() => onNavigate('actions')}
          className={`relative z-10 flex-1 flex flex-col items-center justify-center py-2 px-2 rounded-xl transition-all duration-200 touch-press ${
            activePage === 'actions'
              ? isRoyal
                ? 'text-[#008751] font-bold'
                : 'text-white font-bold'
              : isRoyal
              ? 'text-white/75 hover:text-white'
              : 'text-slate-500 hover:text-slate-900'
          }`}
          title="Orders & Actions"
        >
          <div className="relative">
            <CheckSquare className={`w-4 h-4 transition-transform duration-200 ${activePage === 'actions' ? 'scale-110' : 'scale-100'}`} />
            {actionCount > 0 && (
              <span className={`absolute -top-1 -right-2.5 px-1 py-0.2 rounded-full text-[9px] font-bold leading-none transition-colors duration-200 ${
                activePage === 'actions'
                  ? isRoyal
                    ? 'bg-[#008751] text-white'
                    : 'bg-white text-[#008751]'
                  : isRoyal
                  ? 'bg-white text-[#008751]'
                  : 'bg-[#008751] text-white'
              }`}>
                {actionCount}
              </span>
            )}
          </div>
          <span className="text-[11px] mt-1 tracking-tight font-medium">
            Orders
          </span>
        </button>
      </nav>
    </div>
  );
};
