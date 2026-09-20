import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  MoreHorizontal,
  Bookmark,
  Pause,
  Play,
  Loader2,
} from 'lucide-react';
import { JudiciaryLogo } from '../common/JudiciaryLogo';
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
    const stageMessage =
      processingStage === 'summarization'
        ? 'Synthesizing overview and rulings...'
        : processingStage === 'speaker_diarization'
        ? 'Diarizing testimony & speakers...'
        : 'Transcribing court audio...';

    return (
      <div className="flex-1 flex flex-col bg-[#F8FAF9] text-slate-900 justify-between p-6 select-none relative overflow-hidden">
        {/* Subtle Top Status */}
        <div className="flex items-center justify-between pt-2 flex-shrink-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
            <Loader2 className="w-3 h-3 text-[#008751] animate-spin" />
            <span>Recording saved</span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
            <span>{formatTime(recordingSeconds)}</span>
            {totalWords > 0 && <span>· {totalWords} words</span>}
          </div>
        </div>

        {/* Minimal Centered Card */}
        <div className="my-auto flex flex-col items-center text-center max-w-sm mx-auto space-y-5">
          {/* Minimal Crest Tile */}
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex items-center justify-center">
              <JudiciaryLogo size="sm" variant="crest" lightMode={true} />
            </div>
            <div className="absolute -inset-2 rounded-3xl border border-emerald-500/20 animate-pulse pointer-events-none" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Finalizing Proceeding
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
              {stageMessage}
            </p>
          </div>

          {/* Hairline Minimal Progress Bar */}
          <div className="w-48 space-y-1.5 pt-1">
            <div className="w-full h-1 bg-slate-200/70 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#008751] rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
              <span>Processing</span>
              <span className="font-mono">{progressPercent}%</span>
            </div>
          </div>

          {/* Error Message if Any */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200/80 rounded-xl p-3 text-xs text-rose-700 text-left">
              <span className="font-semibold">Notice:</span> {errorMessage}
            </div>
          )}
        </div>

        {/* Minimal Quiet Footer */}
        <div className="pt-2 pb-2 flex-shrink-0 flex flex-col items-center gap-2">
          {onViewTranscript && (
            <button
              onClick={onViewTranscript}
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors font-medium hover:underline underline-offset-4 cursor-pointer"
            >
              View Live Transcript
            </button>
          )}
          <span className="text-[11px] text-slate-400">
            Proceeding will open automatically once finalized
          </span>
        </div>
      </div>
    );
  }

  // ================= 2. ACTIVE LIVE RECORDING SCREEN =================
  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-[#005A34] via-[#044428] to-[#022C22] text-white overflow-hidden relative select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
        <button
          onClick={onMinimize}
          className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 transition-all flex items-center justify-center text-white"
          title="Minimize to Proceedings list"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1.5">
            <JudiciaryLogo size="sm" variant="crest" lightMode={true} />
            <span className="text-sm font-bold text-white/95 truncate max-w-[200px]">
              {title}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isPaused ? 'bg-amber-400' : 'bg-red-500 animate-pulse'
              }`}
            />
            <span className="text-[11px] font-medium text-emerald-200">
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
              <span className="absolute -top-1 -right-1 bg-white text-[#008751] font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center shadow-xs">
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
