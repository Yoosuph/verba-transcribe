import React from 'react';
import type { LanguageMode, SessionStatus, ProcessingStage } from '../../types/transcription';
import { RecordButton } from './RecordButton';
import { RecordingTimer } from './RecordingTimer';
import { AudioVisualizer } from './AudioVisualizer';
import { AlertCircle, Sparkles, Users, FileText } from 'lucide-react';

interface RecordingControlsProps {
  status: SessionStatus;
  processingStage: ProcessingStage;
  languageMode: LanguageMode;
  recordingSeconds: number;
  analyserNode: AnalyserNode | null;
  errorMessage: string | null;
  onStart: () => void;
  onStop: () => void;
  onLanguageChange: (mode: LanguageMode) => void;
}

export const RecordingControls: React.FC<RecordingControlsProps> = ({
  status,
  processingStage,
  languageMode,
  recordingSeconds,
  analyserNode,
  errorMessage,
  onStart,
  onStop,
  onLanguageChange,
}) => {
  const isRecording = status === 'recording';
  const isProcessing = status === 'processing';

  const getStageInfo = () => {
    switch (processingStage) {
      case 'final_transcription':
        return {
          icon: <FileText className="w-3.5 h-3.5 animate-pulse text-emerald-300" />,
          label: 'Processing Speech Audio...',
        };
      case 'speaker_diarization':
        return {
          icon: <Users className="w-3.5 h-3.5 animate-bounce text-emerald-300" />,
          label: 'Identifying & Diarizing Speakers...',
        };
      case 'summarization':
        return {
          icon: <Sparkles className="w-3.5 h-3.5 animate-spin text-white" />,
          label: 'Generating Grounded Meeting Summary...',
        };
      default:
        return null;
    }
  };

  const stageInfo = getStageInfo();

  return (
    <div className="w-full bg-[#0a140f]/85 border border-emerald-500/20 rounded-3xl p-4 shadow-2xl backdrop-blur-xl ring-1 ring-white/5 space-y-3">
      {/* Top Bar: Language Mode Segmented Plate & Timer */}
      <div className="flex items-center justify-between gap-2">
        {/* Language Segmented Plate */}
        <div className="inline-flex p-1 bg-[#050a07] rounded-xl border border-emerald-500/15">
          <button
            onClick={() => onLanguageChange('auto')}
            disabled={isRecording || isProcessing}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all touch-press ${
              languageMode === 'auto'
                ? 'bg-[#008751] text-white shadow-md shadow-emerald-950'
                : 'text-slate-400 hover:text-white'
            } ${isRecording || isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Auto (EN/HA)
          </button>
          <button
            onClick={() => onLanguageChange('en')}
            disabled={isRecording || isProcessing}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all touch-press ${
              languageMode === 'en'
                ? 'bg-[#008751] text-white shadow-md shadow-emerald-950'
                : 'text-slate-400 hover:text-white'
            } ${isRecording || isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            English
          </button>
          <button
            onClick={() => onLanguageChange('ha')}
            disabled={isRecording || isProcessing}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all touch-press ${
              languageMode === 'ha'
                ? 'bg-[#008751] text-white shadow-md shadow-emerald-950'
                : 'text-slate-400 hover:text-white'
            } ${isRecording || isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Hausa
          </button>
        </div>

        {/* Timer */}
        <RecordingTimer
          seconds={recordingSeconds}
          isRecording={isRecording}
        />
      </div>

      {/* Main Record/Stop Action Plate */}
      <RecordButton
        status={status}
        onStart={onStart}
        onStop={onStop}
      />

      {/* Real-Time Waveform Visualizer */}
      <AudioVisualizer
        analyserNode={analyserNode}
        isRecording={isRecording}
      />

      {/* Processing Banner */}
      {isProcessing && stageInfo && (
        <div className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-xs text-emerald-200 animate-pulse font-medium">
          {stageInfo.icon}
          <span>{stageInfo.label}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/30 text-xs text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
