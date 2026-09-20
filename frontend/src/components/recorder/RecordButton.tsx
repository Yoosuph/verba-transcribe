import React from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import type { SessionStatus } from '../../types/transcription';

interface RecordButtonProps {
  status: SessionStatus;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}

export const RecordButton: React.FC<RecordButtonProps> = ({
  status,
  onStart,
  onStop,
  disabled = false,
}) => {
  const isRecording = status === 'recording';
  const isConnecting = status === 'connecting';
  const isProcessing = status === 'processing';

  if (isConnecting || isProcessing) {
    return (
      <button
        disabled
        className="w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl bg-emerald-950/60 text-emerald-200 border border-emerald-500/30 text-sm font-semibold tracking-wide cursor-not-allowed shadow-lg"
      >
        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
        <span>{isConnecting ? 'Connecting Stream...' : 'Synthesizing Meeting Data...'}</span>
      </button>
    );
  }

  if (isRecording) {
    return (
      <button
        onClick={onStop}
        disabled={disabled}
        className="group relative w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-98 text-white font-bold text-sm tracking-wide shadow-xl shadow-rose-950 border border-rose-400/40 transition-all duration-150 cursor-pointer touch-press"
      >
        <Square className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
        <span>Stop & Process</span>
        <span className="absolute -inset-1 rounded-2xl bg-rose-500/25 blur-sm -z-10 animate-pulse" />
      </button>
    );
  }

  return (
    <button
      onClick={onStart}
      disabled={disabled}
      className="group relative w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl bg-[#008751] hover:bg-[#009b5d] active:scale-98 text-white font-bold text-sm tracking-wide shadow-xl shadow-emerald-950 border border-white/20 transition-all duration-150 cursor-pointer touch-press ring-2 ring-emerald-500/30"
    >
      <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
        <Mic className="w-3.5 h-3.5 text-white" />
      </div>
      <span>Start Session</span>
      <span className="absolute -inset-1 rounded-2xl bg-emerald-500/20 blur-sm -z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
};
