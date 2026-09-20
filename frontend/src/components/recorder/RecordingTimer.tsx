import React from 'react';

interface RecordingTimerProps {
  seconds: number;
  isRecording: boolean;
}

export const RecordingTimer: React.FC<RecordingTimerProps> = ({ seconds, isRecording }) => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const formatted = hrs > 0
    ? `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800">
      {isRecording ? (
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
        </span>
      ) : (
        <span className="w-2 h-2 rounded-full bg-slate-600" />
      )}
      <span className="font-mono text-xs font-semibold tracking-wider text-slate-200">
        {formatted}
      </span>
      {isRecording && (
        <span className="text-[10px] uppercase font-bold tracking-wider text-rose-400 ml-1">
          REC
        </span>
      )}
    </div>
  );
};
