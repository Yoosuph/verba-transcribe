import { describe, it, expect, vi } from 'vitest';
import { floatTo16BitPCM } from '../audio/pcmEncoder';
import { resampleTo16kHz } from '../audio/resampler';
import { TranscriptionSocket } from '../services/transcriptionSocket';

describe('Audio Utilities', () => {
  it('correctly converts Float32Array to Signed 16-bit PCM Int16 ArrayBuffer', () => {
    const input = new Float32Array([0.0, 1.0, -1.0, 0.5, -0.5]);
    const buffer = floatTo16BitPCM(input);

    expect(buffer.byteLength).toBe(input.length * 2);
    const view = new Int16Array(buffer);

    expect(view[0]).toBe(0);
    expect(view[1]).toBe(32767);
    expect(view[2]).toBe(-32768);
    expect(Math.abs(view[3] - 16383)).toBeLessThanOrEqual(1);
    expect(Math.abs(view[4] - (-16384))).toBeLessThanOrEqual(1);
  });

  it('clamps values outside [-1.0, 1.0] safely', () => {
    const input = new Float32Array([2.5, -3.0]);
    const buffer = floatTo16BitPCM(input);
    const view = new Int16Array(buffer);

    expect(view[0]).toBe(32767);
    expect(view[1]).toBe(-32768);
  });

  it('resamples 48kHz audio to 16kHz via linear interpolation', () => {
    // 48 samples at 48kHz downsampled to 16kHz should yield ~16 samples
    const sourceData = new Float32Array(48).fill(0.8);
    const resampled = resampleTo16kHz(sourceData, 48000);

    expect(resampled.length).toBe(16);
    expect(resampled[0]).toBeCloseTo(0.8, 2);
  });

  it('returns identical buffer if source is already 16kHz', () => {
    const sourceData = new Float32Array(16).fill(0.5);
    const resampled = resampleTo16kHz(sourceData, 16000);

    expect(resampled).toBe(sourceData);
  });
});

describe('TranscriptionSocket Event Parsing', () => {
  it('dispatches interim and final transcript events to callbacks', () => {
    const onInterim = vi.fn();
    const onFinal = vi.fn();
    const onProcessing = vi.fn();
    const onSummary = vi.fn();

    const socketHandler = new TranscriptionSocket('test_sess', {
      onInterimTranscript: onInterim,
      onFinalLiveSegment: onFinal,
      onProcessingStage: onProcessing,
      onSummary: onSummary,
    });

    // Invoke private handleInboundMessage via prototype or casting
    const handler = (socketHandler as any).handleInboundMessage.bind(socketHandler);

    handler({ type: 'transcript.interim', text: 'Barkan ku...', session_id: 'test_sess' });
    expect(onInterim).toHaveBeenCalledWith('Barkan ku...');

    handler({ type: 'transcript.final', text: 'Barkan ku da warhaka.', session_id: 'test_sess' });
    expect(onFinal).toHaveBeenCalledWith('Barkan ku da warhaka.');

    handler({ type: 'processing', stage: 'speaker_diarization' });
    expect(onProcessing).toHaveBeenCalledWith('speaker_diarization');

    const dummySummary = { executive_summary: 'Test summary' };
    handler({ type: 'summary', session_id: 'test_sess', data: dummySummary });
    expect(onSummary).toHaveBeenCalledWith(dummySummary);
  });
});
