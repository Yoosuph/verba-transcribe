import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  LanguageMode,
  SessionStatus,
  ProcessingStage,
  LiveTranscriptItem,
  FinalTranscriptData,
  MeetingSummary,
} from '../types/transcription';
import { useAudioRecorder } from './useAudioRecorder';
import { TranscriptionSocket } from '../services/transcriptionSocket';
import { createSession, updateSession, type SessionPatch } from '../services/api';
import { apiFetch } from '../services/auth';

export function useRecordingSession() {
  const [sessionId, setSessionId] = useState<string>('');
  const [status, setStatus] = useState<SessionStatus>('idle');
  const [processingStage, setProcessingStage] = useState<ProcessingStage>(null);
  const [languageMode, setLanguageMode] = useState<LanguageMode>('auto');
  const [detectedLanguage, setDetectedLanguage] = useState<string>('');
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscriptItem[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [finalTranscript, setFinalTranscript] = useState<FinalTranscriptData | null>(null);
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [highlightedSegmentId, setHighlightedSegmentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'live' | 'transcript' | 'summary' | 'decisions' | 'actions' | 'speakers'>('live');

  const {
    isRecording,
    isPaused,
    analyserNode,
    recorderError,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = useAudioRecorder();
  const socketRef = useRef<TranscriptionSocket | null>(null);
  const timerRef = useRef<number | null>(null);
  const processingTimeoutRef = useRef<number | null>(null);
  const statusRef = useRef<SessionStatus>('idle');
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Synchronize recorder errors
  useEffect(() => {
    if (recorderError) {
      setErrorMessage(recorderError);
      setStatus('error');
    }
  }, [recorderError]);

  // Recording timer with pause/resume support
  useEffect(() => {
    if (status === 'recording' && !isPaused) {
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, isPaused]);

  const startSession = useCallback(async (selectedLang: LanguageMode = 'auto', meta?: SessionPatch) => {
    setErrorMessage(null);
    setStatus('connecting');
    setProcessingStage(null);
    setLiveTranscript([]);
    setInterimText('');
    setFinalTranscript(null);
    setSummary(null);
    setSpeakerNames({});
    setLanguageMode(selectedLang);
    setActiveTab('live');
    setRecordingSeconds(0);

    try {
      // Session IDs are generated server-side; clients cannot pick them.
      const created = await createSession(selectedLang);
      const newSessionId = created.id;
      // Apply optional template/agenda BEFORE recording so the summarizer
      // receives the agenda during finalization.
      if (meta && (meta.agenda || meta.template || meta.title)) {
        try {
          await updateSession(newSessionId, meta);
        } catch (e) {
          console.warn('Failed applying session meta:', e);
        }
      }
      setSessionId(newSessionId);

      const socket = new TranscriptionSocket(newSessionId, {
        onConnected: (_sid, resumed) => {
          // Start the live pipeline only on a fresh attach (not a reconnect
          // onto an already-running runtime). Re-sending start after a server
          // restart is required when the server reports a fresh session.
          if (!resumed && (statusRef.current === 'connecting' || statusRef.current === 'recording')) {
            socket.sendJson({
              type: 'start',
              session_id: newSessionId,
              language_mode: selectedLang,
            });
          }
        },
        onInterimTranscript: (text) => {
          setInterimText(text);
        },
        onFinalLiveSegment: (text) => {
          setInterimText('');
          setLiveTranscript((prev) => [
            ...prev,
            {
              id: `live_${Date.now()}_${prev.length}`,
              text,
              is_final: true,
              timestamp_ms: Date.now(),
            },
          ]);
        },
        onProcessingStage: (stage) => {
          setProcessingStage(stage);
        },
        onFinalTranscript: (data) => {
          setFinalTranscript(data);
          if (data.language) setDetectedLanguage(data.language);
          setActiveTab('transcript');
        },
        onSummary: (data) => {
          setSummary(data);
        },
        onComplete: () => {
          if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
          }
          setStatus('complete');
          setProcessingStage(null);
        },
        onError: (code, message) => {
          console.error(`Transcription socket error [${code}]:`, message);
          if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
          }
          setErrorMessage(message);
          setStatus('error');
        },
        onReconnected: () => {
          // Transient network drop recovered — recording continues uninterrupted.
          console.info('WebSocket reconnected; recording continues.');
        },
        onFatal: async (_code, message) => {
          // Could not reconnect: release the microphone and surface the error.
          await stopRecording();
          if (processingTimeoutRef.current) {
            clearTimeout(processingTimeoutRef.current);
            processingTimeoutRef.current = null;
          }
          setErrorMessage(message);
          setStatus('error');
          try {
            socketRef.current?.close();
          } catch {
            /* ignore */
          }
          socketRef.current = null;
        },
        onClose: () => {
          /* explicit close only — no state change */
        },
      });

      await socket.connect();
      socketRef.current = socket;

      // Start audio recording and stream binary PCM frames to WebSocket
      await startRecording((pcmChunk) => {
        socket.sendAudioChunk(pcmChunk);
      });

      setStatus('recording');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Failed to start session');
      try {
        socketRef.current?.close();
      } catch {
        /* ignore */
      }
      socketRef.current = null;
      stopRecording();
    }
  }, [startRecording, stopRecording]);

  const stopSession = useCallback(async () => {
    if (statusRef.current !== 'recording' && statusRef.current !== 'connecting') return;

    setStatus('processing');
    setProcessingStage('final_transcription');

    // Safety: if backend never replies, don't trap the user forever.
    if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    processingTimeoutRef.current = window.setTimeout(() => {
      if (statusRef.current === 'processing') {
        setErrorMessage('Timed out waiting for transcription. Please try again.');
        setStatus('error');
      }
    }, 120000);

    // 1. Stop audio recording
    await stopRecording();

    // 2. Notify backend of stop (queued if socket still connecting/reconnecting)
    if (socketRef.current) {
      socketRef.current.sendJson({ type: 'stop' });
    }
  }, [stopRecording]);

  const renameSpeaker = useCallback(async (oldName: string, newName: string) => {
    if (!oldName || !newName || oldName === newName) return;

    // Optimistically update local speaker names mapping
    setSpeakerNames((prev) => ({ ...prev, [oldName]: newName }));

    // Update final transcript segments
    setFinalTranscript((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        segments: prev.segments.map((seg) =>
          seg.speaker === oldName ? { ...seg, speaker: newName } : seg
        ),
      };
    });

    // Update summary contributions & action items
    setSummary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        speaker_contributions: prev.speaker_contributions.map((c) =>
          c.speaker === oldName ? { ...c, speaker: newName } : c
        ),
        action_items: prev.action_items.map((a) =>
          a.assignee === oldName ? { ...a, assignee: newName } : a
        ),
      };
    });

    // Persist via REST (single source of truth — no parallel WS mutation path)
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/speakers/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: oldName, new_name: newName }),
      });
      if (!res.ok) console.warn('Failed persisting renamed speaker via REST:', res.status);
    } catch (e) {
      console.warn('Failed persisting renamed speaker via REST:', e);
    }
  }, [sessionId]);

  const toggleActionItem = useCallback(async (actionId: string, completed: boolean) => {
    setSummary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        action_items: prev.action_items.map((item) =>
          item.id === actionId ? { ...item, completed } : item
        ),
      };
    });

    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) console.warn('Failed toggling action item via REST:', res.status);
    } catch (e) {
      console.warn('Failed toggling action item via REST:', e);
    }
  }, [sessionId]);

  const jumpToSegment = useCallback((segmentId: string) => {
    setActiveTab('transcript');
    setHighlightedSegmentId(segmentId);

    // Scroll into view
    setTimeout(() => {
      const el = document.getElementById(segmentId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    // Clear highlight pulse after 3 seconds
    setTimeout(() => {
      setHighlightedSegmentId((curr) => (curr === segmentId ? null : curr));
    }, 3000);
  }, []);

  const exportSession = useCallback(async (format: 'markdown' | 'txt' | 'json') => {
    if (!sessionId) return;
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/export?format=${format}`);
      if (!res.ok) {
        setErrorMessage('Export failed. Please try again.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'markdown' ? 'md' : format;
      a.download = `meeting_${sessionId}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Export failed:', e);
      setErrorMessage('Export failed. Please try again.');
    }
  }, [sessionId]);

  return {
    sessionId,
    status,
    processingStage,
    languageMode,
    detectedLanguage,
    liveTranscript,
    interimText,
    finalTranscript,
    summary,
    speakerNames,
    errorMessage,
    recordingSeconds,
    isRecording,
    isPaused,
    analyserNode,
    activeTab,
    highlightedSegmentId,
    setActiveTab,
    setLanguageMode,
    startSession,
    pauseRecording,
    resumeRecording,
    stopSession,
    renameSpeaker,
    toggleActionItem,
    jumpToSegment,
    exportSession,
  };
}
