import React from 'react';

interface TimestampProps {
  seconds: number;
  className?: string;
}

export const Timestamp: React.FC<TimestampProps> = ({ seconds, className = '' }) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  return (
    <span className={`font-mono text-xs text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 ${className}`}>
      {formatted}
    </span>
  );
};
