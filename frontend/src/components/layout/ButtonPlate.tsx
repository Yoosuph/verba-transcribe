import React from 'react';
import {
  Menu,
  FileText,
  ListChecks,
} from 'lucide-react';

export type AppPage = 'meetings' | 'live' | 'transcript' | 'actions';

interface ButtonPlateProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  hasSession: boolean;
  theme?: 'light' | 'royal';
  isRecording?: boolean;
  isProcessing?: boolean;
}

export const ButtonPlate: React.FC<ButtonPlateProps> = ({
  activePage,
  onNavigate,
  hasSession,
  theme = 'light',
  isRecording = false,
  isProcessing = false,
}) => {
  const isRoyal = theme === 'royal';

  const activeIndex =
    activePage === 'meetings'
      ? 0
      : activePage === 'transcript'
      ? 1
      : activePage === 'actions'
      ? 2
      : -1;

  return (
    <div className="w-full px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 z-50 flex-shrink-0 select-none no-print">
      {(isRecording || isProcessing) && activePage !== 'live' && (
        <button
          onClick={() => onNavigate('live')}
          aria-label={isRecording ? 'Return to live recording' : 'View the meeting being finalized'}
          className="w-full mb-2 px-3 py-2.5 rounded-2xl bg-[#042A1D] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] transition-all cursor-pointer"
        >
          <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-amber-400 animate-pulse'}`} aria-hidden="true" />
          <span>{isRecording ? 'Recording in progress — tap to return' : 'Finalizing meeting — tap to view record'}</span>
        </button>
      )}
      <nav
        aria-label="Primary"
        className={`w-full rounded-2xl p-1.5 grid grid-cols-3 gap-1 shadow-[0_4px_24px_rgba(0,0,0,0.07)] transition-all duration-300 relative ${
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
              width: 'calc((100% - 24px) / 3)',
              left: '6px',
              transform: `translateX(calc(${activeIndex} * (100% + 4px)))`,
            }}
          />
        )}

        {/* 1. Meetings */}
        <button
          onClick={() => onNavigate('meetings')}
          aria-current={activePage === 'meetings' ? 'page' : undefined}
          aria-label="All meetings"
          className={`relative z-10 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 cursor-pointer active:scale-95 min-h-[52px] focus-visible:outline-2 ${
            activePage === 'meetings'
              ? isRoyal
                ? 'text-[#008751] font-bold'
                : 'text-white font-bold'
              : isRoyal
              ? 'text-white/70 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="All Meetings"
        >
          <Menu
            className={`w-4 h-4 transition-transform duration-200 ${
              activePage === 'meetings' ? 'scale-110' : 'scale-100'
            }`}
          />
          <span className="text-[11px] mt-1 tracking-tight font-semibold truncate">
            Meetings
          </span>
        </button>

        {/* 2. Transcript of the open meeting */}
        <button
          onClick={() => onNavigate('transcript')}
          disabled={!hasSession}
          aria-current={activePage === 'transcript' ? 'page' : undefined}
          aria-label={
            hasSession ? 'Open transcript, summary and audio' : 'No meeting open yet'
          }
          className={`relative z-10 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 min-h-[52px] ${
            !hasSession
              ? 'opacity-40 cursor-not-allowed'
              : 'cursor-pointer active:scale-95'
          } ${
            activePage === 'transcript'
              ? isRoyal
                ? 'text-[#008751] font-bold'
                : 'text-white font-bold'
              : isRoyal
              ? 'text-white/70 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title={
            hasSession
              ? 'Summary, transcript & audio of the open meeting'
              : 'Open a meeting first'
          }
        >
          <FileText
            className={`w-4 h-4 transition-transform duration-200 ${
              activePage === 'transcript' ? 'scale-110' : 'scale-100'
            }`}
          />
          <span className="text-[11px] mt-1 tracking-tight font-semibold truncate">
            Transcript
          </span>
        </button>

        {/* 3. Action Items */}
        <button
          onClick={() => onNavigate('actions')}
          aria-current={activePage === 'actions' ? 'page' : undefined}
          aria-label="Action items across all meetings"
          className={`relative z-10 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 cursor-pointer active:scale-95 min-h-[52px] ${
            activePage === 'actions'
              ? isRoyal
                ? 'text-[#008751] font-bold'
                : 'text-white font-bold'
              : isRoyal
              ? 'text-white/70 hover:text-white'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          title="Action Items & Decisions"
        >
          <ListChecks
            className={`w-4 h-4 transition-transform duration-200 ${
              activePage === 'actions' ? 'scale-110' : 'scale-100'
            }`}
          />
          <span className="text-[11px] mt-1 tracking-tight font-semibold truncate">
            Actions
          </span>
        </button>
      </nav>
    </div>
  );
};
