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
  const [recordingSeconds, setRecordingSeconds] = useState(0);
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


  const startSession = useCallback(async (selectedLang: LanguageMode = 'auto') => {
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

    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setSessionId(newSessionId);

    try {
      const socket = new TranscriptionSocket(newSessionId, {
        onConnected: () => {
          socket.sendJson({
            type: 'start',
            session_id: newSessionId,
            language_mode: selectedLang,
          });
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
          setProcessingStage(stage as ProcessingStage);
        },
        onFinalTranscript: (data: FinalTranscriptData) => {
          setFinalTranscript(data);
          if (data.language) setDetectedLanguage(data.language);
          setActiveTab('transcript');
        },
        onSummary: (data: MeetingSummary) => {
          setSummary(data);
        },
        onComplete: () => {
          setStatus('complete');
          setProcessingStage(null);
        },
        onError: (code, message) => {
          console.error(`Transcription socket error [${code}]:`, message);
          setErrorMessage(message);
          setStatus('error');
        },
        onClose: () => {
          if (status === 'recording') {
            setStatus('error');
            setErrorMessage('WebSocket connection lost unexpectedly.');
          }
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
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      stopRecording();
    }
  }, [startRecording, stopRecording, status]);

  const stopSession = useCallback(async () => {
    if (status !== 'recording') return;

    setStatus('processing');
    setProcessingStage('final_transcription');

    // 1. Stop audio recording
    await stopRecording();

    // 2. Notify backend of stop
    if (socketRef.current) {
      socketRef.current.sendJson({ type: 'stop' });
    }
  }, [status, stopRecording]);

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

    // Send update over WebSocket
    if (socketRef.current) {
      socketRef.current.sendJson({
        type: 'rename_speaker',
        old_name: oldName,
        new_name: newName,
      });
    }

    // Also persist via REST
    try {
      await fetch(`/api/sessions/${sessionId}/speakers/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_name: oldName, new_name: newName }),
      });
    } catch (e) {
      console.warn("Failed persisting renamed speaker via REST:", e);
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
      await fetch(`/api/sessions/${sessionId}/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      });
    } catch (e) {
      console.warn("Failed toggling action item via REST:", e);
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
    const url = `/api/sessions/${sessionId}/export?format=${format}`;
    window.open(url, '_blank');
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
