import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  MoreHorizontal,
  Bookmark,
  Pause,
  Play,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import type { LiveTranscriptItem, ProcessingStage } from '../../types/transcription';

interface LiveRecordingViewProps {
  title?: string;
  recordingSeconds: number;
  liveTranscript: LiveTranscriptItem[];
  interimText: string;
  analyserNode: AnalyserNode | null;
  isPaused: boolean;
  isProcessing?: boolean;
  processingStage?: ProcessingStage;
  errorMessage?: string | null;
  onPause: () => void;
  onResume: () => void;
  onMinimize: () => void;
  onStop: () => void;
  onViewTranscript?: () => void;
  languageMode?: string;
}

export const LiveRecordingView: React.FC<LiveRecordingViewProps> = ({
  title = 'Live Recording',
  recordingSeconds,
  liveTranscript,
  interimText,
  analyserNode,
  isPaused,
  isProcessing = false,
  processingStage = null,
  errorMessage = null,
  onPause,
  onResume,
  onMinimize,
  onStop,
  onViewTranscript,
  languageMode = 'auto',
}) => {
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [localStopping, setLocalStopping] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset local stopping flag if processing is done
  useEffect(() => {
    if (!isProcessing) {
      setLocalStopping(false);
    }
  }, [isProcessing]);

  // Format real elapsed seconds as MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleStopClick = () => {
    setLocalStopping(true);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([30, 50]);
      } catch {}
    }
    onStop();
  };

  // Real-time canvas waveform visualizer reacting to microphone input
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const bufferLength = analyserNode ? analyserNode.frequencyBinCount : 32;
    const dataArray = analyserNode ? new Uint8Array(bufferLength) : new Uint8Array(32);

    const barCount = 36;

    const render = () => {
      animId = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (analyserNode && !isPaused && !isProcessing && !localStopping) {
        analyserNode.getByteFrequencyData(dataArray);
      }

      const barWidth = 3;
      const spacing = (width - barCount * barWidth) / (barCount - 1);

      for (let i = 0; i < barCount; i++) {
        let value = 0;
        if (analyserNode && !isPaused && !isProcessing && !localStopping) {
          const step = Math.floor(bufferLength / barCount);
          value = dataArray[i * step] / 255;
        } else {
          // Subtle idle wave
          value = 0.08 + 0.04 * Math.sin(Date.now() / 250 + i * 0.4);
        }

        const barHeight = Math.max(3, value * height * 0.85);
        const x = i * (barWidth + spacing);
        const y = (height - barHeight) / 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [analyserNode, isPaused, isProcessing, localStopping]);

  // Auto-scroll transcript container to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveTranscript, interimText]);

  const showProcessingScreen = isProcessing || localStopping;
  const hasContent = liveTranscript.length > 0 || interimText;

  // Calculate total words spoken in this session
  const totalWords = liveTranscript.reduce((acc, t) => {
    return acc + (t.text ? t.text.trim().split(/\s+/).filter(Boolean).length : 0);
  }, 0);

  // Compute progress percentage based on processing stage
  const progressPercent =
    processingStage === 'summarization'
      ? 85
      : processingStage === 'speaker_diarization'
      ? 60
      : processingStage === 'final_transcription'
      ? 35
      : 20;

  // ================= 1. DEDICATED PROCESSING & COMPLETION SCREEN =================
  if (showProcessingScreen) {
    return (
      <div className="flex-1 flex flex-col bg-[#2A39E8] text-white p-6 justify-between select-none relative overflow-hidden">
        {/* Subtle Background Glows */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-indigo-950/40 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header Status Indicators */}
        <div className="flex items-center justify-between pt-2 flex-shrink-0 relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-emerald-200 text-xs font-semibold shadow-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            <span>Recording Stopped</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-white/90 bg-white/15 px-3 py-1 rounded-full border border-white/10">
              {formatTime(recordingSeconds)}
            </span>
            {totalWords > 0 && (
              <span className="text-xs text-white/80 bg-white/10 px-2.5 py-1 rounded-full border border-white/10">
                {totalWords} words
              </span>
            )}
          </div>
        </div>

        {/* Center Progress Card */}
        <div className="my-auto space-y-6 relative z-10">
          {/* Animated Glowing Beacon */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-white/15 border border-white/30 flex items-center justify-center shadow-2xl backdrop-blur-md">
                <Loader2 className="w-9 h-9 text-white animate-spin" />
              </div>
              <div className="absolute inset-0 rounded-full bg-white/20 animate-ping pointer-events-none" />
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-black tracking-tight text-white">
                Finalizing Meeting
              </h2>
              <p className="text-xs text-white/80 max-w-xs mx-auto leading-relaxed">
                Transcribing audio, identifying distinct speakers, and synthesizing your grounded executive summary.
              </p>
            </div>
          </div>

          {/* Stepper Card */}
          <div className="bg-white/15 backdrop-blur-md rounded-2xl p-5 border border-white/20 shadow-xl space-y-4">
            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium text-white/90">
                <span>Pipeline Status</span>
                <span className="font-mono font-bold">{progressPercent}%</span>
              </div>
              <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-700 ease-out shadow-sm"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Steps Checklist */}
            <div className="space-y-3 pt-1 text-xs">
              {/* Step 1: Audio Finalized */}
              <div className="flex items-center gap-3 text-white/95">
                <div className="w-5 h-5 rounded-full bg-emerald-400 text-slate-900 flex items-center justify-center flex-shrink-0 font-bold text-[11px] shadow-xs">
                  ✓
                </div>
                <div className="flex-1">
                  <span className="font-semibold block text-white">Audio Stream Finalized</span>
                  <span className="text-[11px] text-white/70">
                    Microphone released · 16kHz audio captured ({formatTime(recordingSeconds)})
                  </span>
                </div>
              </div>

              {/* Step 2: Speaker Diarization */}
              <div className="flex items-center gap-3 text-white/95">
                {processingStage === 'summarization' ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-400 text-slate-900 flex items-center justify-center flex-shrink-0 font-bold text-[11px] shadow-xs">
                    ✓
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                  </div>
                )}
                <div className="flex-1">
                  <span className="font-semibold block text-white">Speaker Diarization & Timestamps</span>
                  <span className="text-[11px] text-white/70">
                    {processingStage === 'summarization'
                      ? 'Speakers aligned and labeled'
                      : 'Segmenting dialogue & detecting language'}
                  </span>
                </div>
              </div>

              {/* Step 3: Meeting Notes & Actions */}
              <div className="flex items-center gap-3 text-white/95">
                {processingStage === 'summarization' ? (
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-white/50 text-[11px] font-semibold">
                    3
                  </div>
                )}
                <div className="flex-1">
                  <span className="font-semibold block text-white">Grounded Summary & Decisions</span>
                  <span className="text-[11px] text-white/70">
                    {processingStage === 'summarization'
                      ? 'Synthesizing overview, decisions, and action items...'
                      : 'Awaiting diarized transcript'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Error message banner if any */}
          {errorMessage && (
            <div className="bg-red-500/20 border border-red-400/40 rounded-xl p-3 text-xs text-red-100 flex items-start gap-2">
              <span className="font-bold">Notice:</span>
              <span className="flex-1">{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-2 pb-2 flex-shrink-0 flex flex-col items-center gap-2 relative z-10">
          {onViewTranscript && (
            <button
              onClick={onViewTranscript}
              className="text-xs text-white/80 hover:text-white underline underline-offset-2 py-1 px-3 rounded-lg hover:bg-white/10 transition-colors"
            >
              View Live Transcript Now
            </button>
          )}
          <span className="text-[11px] text-white/60 text-center">
            Audio preserved · You will automatically be redirected to the summary once ready.
          </span>
        </div>
      </div>
    );
  }

  // ================= 2. ACTIVE LIVE RECORDING SCREEN =================
  return (
    <div className="flex-1 flex flex-col bg-[#2A39E8] text-white overflow-hidden relative select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
        <button
          onClick={onMinimize}
          className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 transition-all flex items-center justify-center text-white"
          title="Minimize to Meetings list"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-white/95 truncate max-w-[200px]">
            {title}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isPaused ? 'bg-amber-400' : 'bg-red-500 animate-pulse'
              }`}
            />
            <span className="text-[11px] font-medium text-white/80">
              {isPaused ? 'Paused' : 'Recording'}
            </span>
          </div>
        </div>

        <button className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 transition-all flex items-center justify-center text-white">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Real Elapsed Timer */}
      <div className="pt-2 pb-1 text-center flex-shrink-0">
        <h1 className="text-[54px] font-black tracking-tight text-white leading-none font-mono">
          {formatTime(recordingSeconds)}
        </h1>
      </div>

      {/* Language Status Pill */}
      <div className="flex justify-center pb-3 flex-shrink-0">
        <div className="bg-white/15 backdrop-blur-sm text-white/95 text-xs font-medium px-4 py-1.5 rounded-full shadow-inner flex items-center gap-2">
          <span>
            {languageMode === 'ha'
              ? 'Hearing Hausa'
              : languageMode === 'en'
              ? 'Hearing English'
              : 'Hearing English & Hausa'}
          </span>
        </div>
      </div>

      {/* Live Audio Waveform Canvas */}
      <div className="px-6 py-1 h-14 flex items-center justify-center flex-shrink-0">
        <canvas
          ref={canvasRef}
          width={320}
          height={50}
          className="w-full h-full max-w-[320px]"
        />
      </div>

      {/* Real Live Transcript Feed */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-3 space-y-4 font-sans text-left"
      >
        {!hasContent ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-white/60 space-y-2 py-8">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              <span className="w-3 h-3 rounded-full bg-white animate-ping" />
            </div>
            <p className="text-sm font-medium text-white/80">
              Listening for speech...
            </p>
            <p className="text-xs text-white/50 max-w-xs">
              Speak naturally in English, Hausa, or code-switched terms. Real-time transcription will stream below.
            </p>
          </div>
        ) : (
          <>
            {liveTranscript.map((item, idx) => {
              const speaker = item.speaker_label || `Speaker`;
              const isInterim = !item.is_final;

              return (
                <div key={item.id || idx} className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-3 py-0.5 rounded-full">
                    <span>{speaker}</span>
                  </div>
                  <p className="text-[15px] font-medium text-white/95 leading-relaxed">
                    {item.text}
                    {isInterim && <span className="streaming-cursor">|</span>}
                  </p>
                </div>
              );
            })}

            {interimText && (
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white text-xs font-semibold px-3 py-0.5 rounded-full">
                  <span>Speaker</span>
                </div>
                <p className="text-[15px] font-medium text-white/95 leading-relaxed">
                  {interimText}
                  <span className="streaming-cursor">|</span>
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Controls: Mark, Stop, Pause/Continue */}
      <div className="px-8 pt-2 pb-6 flex items-center justify-between flex-shrink-0 z-30">
        {/* Mark Bookmark */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={() => setBookmarks((prev) => [...prev, recordingSeconds])}
            className="w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 active:scale-90 transition-all flex items-center justify-center text-white shadow-md relative"
            title="Mark timestamp bookmark"
          >
            <Bookmark className="w-6 h-6 fill-white/80" />
            {bookmarks.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-white text-[#2A39E8] font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-xs">
                {bookmarks.length}
              </span>
            )}
          </button>
          <span className="text-xs font-medium text-white/80">Mark</span>
        </div>

        {/* Prominent Stop Button with Instant Visual/Haptic Feedback */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={handleStopClick}
            className="w-20 h-20 rounded-full bg-white text-slate-900 active:scale-95 transition-all flex items-center justify-center shadow-[0_10px_35px_rgba(0,0,0,0.35)] touch-press cursor-pointer hover:shadow-2xl hover:scale-105 group relative"
            title="Stop recording and finalize meeting"
            aria-label="Stop recording"
          >
            <div className="w-8 h-8 rounded-lg bg-[#EF4444] group-hover:scale-95 transition-transform shadow-inner flex items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-xs bg-white/40 block" />
            </div>
          </button>
          <span className="text-xs font-bold text-white tracking-wide">Stop Recording</span>
        </div>

        {/* Pause / Continue */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={() => (isPaused ? onResume() : onPause())}
            className="w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 active:scale-90 transition-all flex items-center justify-center text-white shadow-md"
            title={isPaused ? 'Continue recording' : 'Pause recording'}
          >
            {isPaused ? (
              <Play className="w-6 h-6 fill-white ml-0.5" />
            ) : (
              <Pause className="w-6 h-6 fill-white" />
            )}
          </button>
          <span className="text-xs font-medium text-white/80">
            {isPaused ? 'Continue' : 'Pause'}
          </span>
        </div>
      </div>
    </div>
  );
};
