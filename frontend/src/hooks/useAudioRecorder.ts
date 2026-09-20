import { useState, useRef, useCallback } from 'react';
import { AudioProcessor } from '../audio/audioProcessor';

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const processorRef = useRef<AudioProcessor | null>(null);

  const startRecording = useCallback(async (onAudioChunk: (chunk: ArrayBuffer) => void) => {
    setRecorderError(null);
    try {
      const processor = new AudioProcessor();
      processorRef.current = processor;

      const analyser = await processor.start({
        onAudioChunk,
        onError: (err) => {
          setRecorderError(err.message);
          setIsRecording(false);
        },
      });

      setAnalyserNode(analyser);
      setIsRecording(true);
      return analyser;
    } catch (err: any) {
      const msg = err.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Please allow microphone access in your browser.'
        : err.message || 'Failed to initialize microphone.';
      setRecorderError(msg);
      setIsRecording(false);
      throw new Error(msg);
    }
  }, []);

  const [isPaused, setIsPaused] = useState(false);

  const pauseRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.resume();
      setIsPaused(false);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!processorRef.current) return null;
    try {
      const blob = await processorRef.current.stop();
      processorRef.current = null;
      setAnalyserNode(null);
      setIsRecording(false);
      setIsPaused(false);
      return blob;
    } catch (err: any) {
      console.error("Error stopping recorder:", err);
      setIsRecording(false);
      setIsPaused(false);
      return null;
    }
  }, []);

  return {
    isRecording,
    isPaused,
    analyserNode,
    recorderError,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  };

}
