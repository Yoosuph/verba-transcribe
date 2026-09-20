import React from 'react';
import {
  FileText,
  Sparkles,
  Gavel,
  CheckSquare,
  Users,
  Radio,
} from 'lucide-react';

interface SidebarProps {
  activeTab: 'live' | 'transcript' | 'summary' | 'decisions' | 'actions' | 'speakers';
  onTabChange: (tab: 'live' | 'transcript' | 'summary' | 'decisions' | 'actions' | 'speakers') => void;
  sessionData: {
    status: string;
    hasFinalTranscript: boolean;
    hasSummary: boolean;
    segmentCount: number;
    decisionCount: number;
    actionCount: number;
    speakerCount: number;
  };
  onOpenSpeakerManager: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  sessionData,
  onOpenSpeakerManager,
}) => {
  const isRecording = sessionData.status === 'recording';

  return (
    <nav className="flex items-center gap-1.5 p-1 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-x-auto">
      {/* Live Transcript Tab */}
      <button
        onClick={() => onTabChange('live')}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
          activeTab === 'live'
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
        }`}
      >
        <Radio className={`w-3.5 h-3.5 ${isRecording ? 'text-rose-400 animate-pulse' : ''}`} />
        <span>Live Stream</span>
        {isRecording && (
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
        )}
      </button>

      {/* Final Transcript Tab */}
      <button
        onClick={() => onTabChange('transcript')}
        disabled={!sessionData.hasFinalTranscript}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
          activeTab === 'transcript'
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
            : sessionData.hasFinalTranscript
            ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            : 'text-slate-600 cursor-not-allowed opacity-50'
        }`}
      >
        <FileText className="w-3.5 h-3.5" />
        <span>Final Transcript</span>
        {sessionData.segmentCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
            {sessionData.segmentCount}
          </span>
        )}
      </button>

      {/* Summary Tab */}
      <button
        onClick={() => onTabChange('summary')}
        disabled={!sessionData.hasSummary}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
          activeTab === 'summary'
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
            : sessionData.hasSummary
            ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            : 'text-slate-600 cursor-not-allowed opacity-50'
        }`}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>Summary</span>
      </button>

      {/* Decisions Tab */}
      <button
        onClick={() => onTabChange('decisions')}
        disabled={!sessionData.hasSummary}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
          activeTab === 'decisions'
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
            : sessionData.hasSummary
            ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            : 'text-slate-600 cursor-not-allowed opacity-50'
        }`}
      >
        <Gavel className="w-3.5 h-3.5" />
        <span>Decisions</span>
        {sessionData.decisionCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-400 font-mono">
            {sessionData.decisionCount}
          </span>
        )}
      </button>

      {/* Action Items Tab */}
      <button
        onClick={() => onTabChange('actions')}
        disabled={!sessionData.hasSummary}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
          activeTab === 'actions'
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
            : sessionData.hasSummary
            ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            : 'text-slate-600 cursor-not-allowed opacity-50'
        }`}
      >
        <CheckSquare className="w-3.5 h-3.5" />
        <span>Action Items</span>
        {sessionData.actionCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-500/20 text-cyan-400 font-mono">
            {sessionData.actionCount}
          </span>
        )}
      </button>

      {/* Speakers Tab / Manager */}
      <button
        onClick={() => {
          onTabChange('speakers');
          if (sessionData.speakerCount > 0) {
            onOpenSpeakerManager();
          }
        }}
        disabled={!sessionData.hasFinalTranscript}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
          activeTab === 'speakers'
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
            : sessionData.hasFinalTranscript
            ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            : 'text-slate-600 cursor-not-allowed opacity-50'
        }`}
      >
        <Users className="w-3.5 h-3.5" />
        <span>Speakers</span>
        {sessionData.speakerCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-400 font-mono">
            {sessionData.speakerCount}
          </span>
        )}
      </button>
    </nav>
  );
};
