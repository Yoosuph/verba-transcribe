import React, { useEffect, useRef } from 'react';
import type { LiveTranscriptItem } from '../../types/transcription';
import { Mic, Activity, Radio } from 'lucide-react';

interface LiveTranscriptProps {
  liveTranscript: LiveTranscriptItem[];
  interimText: string;
  isRecording: boolean;
  languageMode: string;
}

export const LiveTranscript: React.FC<LiveTranscriptProps> = ({
  liveTranscript,
  interimText,
  isRecording,
  languageMode,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveTranscript, interimText]);

  return (
    <div className="flex flex-col h-full bg-[#09120c]/85 rounded-3xl border border-emerald-500/20 overflow-hidden shadow-2xl backdrop-blur-xl ring-1 ring-white/5">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-500/15 bg-[#0b1610]/70">
        <div className="flex items-center gap-2">
          <Radio className={`w-3.5 h-3.5 ${isRecording ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`} />
          <h2 className="text-xs font-bold tracking-wide uppercase text-white">
            Real-Time Stream
          </h2>
        </div>

        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="px-2 py-0.5 rounded-full bg-[#050a07] text-emerald-300 font-mono text-[10px] border border-emerald-500/20">
            {languageMode === 'auto' ? 'Auto (EN / HA)' : languageMode.toUpperCase()}
          </span>
          {isRecording && (
            <span className="inline-flex items-center gap-1 text-emerald-300 font-medium text-[11px] bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Transcript Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[360px]">
        {liveTranscript.length === 0 && !interimText && (
          <div className="flex flex-col items-center justify-center h-60 text-center text-slate-400 px-4">
            <div className="p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/25 mb-3 shadow-inner">
              <Mic className={`w-7 h-7 ${isRecording ? 'text-emerald-400 animate-bounce' : 'text-slate-500'}`} />
            </div>
            {isRecording ? (
              <>
                <p className="text-sm font-semibold text-white">Listening to speech...</p>
                <p className="text-xs text-emerald-200/60 mt-1 max-w-xs">
                  Speak naturally in English, Hausa, or mixed phrases. Words stream in real time.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-300">Ready to Record</p>
                <p className="text-xs text-slate-500 mt-1">
                  Tap the green Start button above to begin live transcription.
                </p>
              </>
            )}
          </div>
        )}

        {/* Finalized live segments */}
        {liveTranscript.map((item, idx) => (
          <div
            key={item.id || idx}
            className="p-3 rounded-xl bg-[#0d1a12]/80 border border-emerald-500/15 text-slate-100 text-sm sm:text-base leading-relaxed animate-fade-in"
          >
            <div className="flex items-center justify-between text-[10px] text-emerald-300/70 mb-1 font-mono">
              <span>Segment {idx + 1}</span>
              <span className="text-slate-500">Committed</span>
            </div>
            <p className="text-white font-normal">{item.text}</p>
          </div>
        ))}

        {/* Interim Text (Streaming words) */}
        {interimText && (
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-100 text-sm sm:text-base leading-relaxed shadow-lg shadow-emerald-950">
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-300 font-semibold mb-1">
              <Activity className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              <span>Transcribing live speech...</span>
            </div>
            <p className="font-normal text-white italic">
              {interimText}
              <span className="inline-block w-2 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle" />
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};
