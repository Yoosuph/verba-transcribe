import { floatTo16BitPCM } from './pcmEncoder';
import { resampleTo16kHz } from './resampler';

export interface AudioProcessorCallbacks {
  onAudioChunk: (chunk: ArrayBuffer) => void;
  onError?: (error: Error) => void;
}

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRunning = false;
  private isPaused = false;

  pause(): void {
    if (!this.isRunning) return;
    this.isPaused = true;
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.pause();
      } catch {}
    }
  }

  resume(): void {
    if (!this.isRunning) return;
    this.isPaused = false;
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      try {
        this.mediaRecorder.resume();
      } catch {}
    }
  }

  getIsPaused(): boolean {
    return this.isPaused;
  }


  async start(callbacks: AudioProcessorCallbacks): Promise<AnalyserNode> {
    if (this.isRunning) {
      throw new Error("Audio processor is already running");
    }

    try {
      // 1. Obtain user microphone stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 2. Initialize AudioContext (prefer 16000Hz if supported natively)
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      try {
        this.audioContext = new AudioCtxClass({ sampleRate: 16000 });
      } catch {
        this.audioContext = new AudioCtxClass();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // 3. Create Analyser for real-time waveform visualizer
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 128;
      this.analyserNode.smoothingTimeConstant = 0.8;
      sourceNode.connect(this.analyserNode);

      // 4. Try AudioWorklet first, fall back to ScriptProcessor if needed
      let workletSuccess = false;
      if (this.audioContext.audioWorklet) {
        try {
          await this.audioContext.audioWorklet.addModule('/audio-worklet-processor.js');
          this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-worklet-processor');

          this.workletNode.port.onmessage = (event) => {
            if (!this.isRunning || this.isPaused) return;
            const floatData = event.data as Float32Array;
            const resampled = resampleTo16kHz(floatData, this.audioContext?.sampleRate || 16000);
            const pcmBuffer = floatTo16BitPCM(resampled);
            callbacks.onAudioChunk(pcmBuffer);
          };

          sourceNode.connect(this.workletNode);
          // Keep the worklet pulled on all browsers; use a zero-gain sink
          // so no microphone audio is audible while guaranteeing onaudioprocess.
          try {
            const sink = this.audioContext.createGain();
            sink.gain.value = 0;
            this.workletNode.connect(sink);
            sink.connect(this.audioContext.destination);
          } catch {
            this.workletNode.connect(this.audioContext.destination);
          }
          workletSuccess = true;
        } catch (e) {
          console.warn("AudioWorklet failed to load; using ScriptProcessor fallback:", e);
        }
      }

      if (!workletSuccess) {
        // Fallback for environments where AudioWorklet is blocked
        this.scriptNode = this.audioContext.createScriptProcessor(1024, 1, 1);
        this.scriptNode.onaudioprocess = (event) => {
          if (!this.isRunning || this.isPaused) return;
          const input = event.inputBuffer.getChannelData(0);
          const resampled = resampleTo16kHz(input, this.audioContext?.sampleRate || 16000);
          const pcmBuffer = floatTo16BitPCM(resampled);
          callbacks.onAudioChunk(pcmBuffer);
        };
        sourceNode.connect(this.scriptNode);
        this.scriptNode.connect(this.audioContext.destination);
      }


      // 5. MediaRecorder as secondary full-recording collector
      this.recordedChunks = [];
      try {
        const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
        const supportedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';
        this.mediaRecorder = supportedMime ? new MediaRecorder(this.mediaStream, { mimeType: supportedMime }) : new MediaRecorder(this.mediaStream);

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.recordedChunks.push(event.data);
          }
        };
        this.mediaRecorder.start(500);
      } catch (recErr) {
        console.warn("MediaRecorder secondary recording not initialized:", recErr);
      }

      this.isRunning = true;
      return this.analyserNode;
    } catch (err) {
      this.stop();
      if (callbacks.onError) {
        callbacks.onError(err instanceof Error ? err : new Error(String(err)));
      }
      throw err;
    }
  }

  async stop(): Promise<Blob | null> {
    this.isRunning = false;

    // Stop MediaRecorder
    let completeBlob: Blob | null = null;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        const stopPromise = new Promise<void>((resolve) => {
          if (this.mediaRecorder) {
            this.mediaRecorder.onstop = () => resolve();
            this.mediaRecorder.stop();
          } else {
            resolve();
          }
        });
        await stopPromise;
        if (this.recordedChunks.length > 0) {
          completeBlob = new Blob(this.recordedChunks, { type: this.recordedChunks[0].type || 'audio/webm' });
        }
      } catch (e) {
        console.warn("Error stopping MediaRecorder:", e);
      }
    }

    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch {}
      this.workletNode = null;
    }

    if (this.scriptNode) {
      try {
        this.scriptNode.disconnect();
      } catch {}
      this.scriptNode = null;
    }

    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch {}
      this.analyserNode = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    return completeBlob;
  }
}
