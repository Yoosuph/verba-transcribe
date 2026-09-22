import type {
  InboundWSMessage,
  OutboundWSMessage,
  FinalTranscriptData,
  MeetingSummary,
  ProcessingStage,
} from '../types/transcription';
import { withTokenParam } from './auth';

export interface SocketCallbacks {
  onConnected?: (sessionId: string, resumed: boolean) => void;
  onInterimTranscript?: (text: string) => void;
  onFinalLiveSegment?: (text: string) => void;
  onProcessingStage?: (stage: ProcessingStage) => void;
  onFinalTranscript?: (data: FinalTranscriptData) => void;
  onSummary?: (data: MeetingSummary) => void;
  onComplete?: () => void;
  onSessionLimit?: (code: string, message: string) => void;
  onError?: (code: string, message: string) => void;
  /** Socket dropped and reconnected successfully (recording continues). */
  onReconnected?: () => void;
  /** Reconnect attempts exhausted — the caller must stop the microphone. */
  onFatal?: (code: string, message: string) => void;
  /** Only fired on explicit close() — not on transient drops. */
  onClose?: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const MAX_BUFFERED_AUDIO_CHUNKS = 1500; // ~30s of 20ms frames
const WATCHDOG_INTERVAL_MS = 10_000;
const WATCHDOG_SILENCE_MS = 45_000;

export class TranscriptionSocket {
  private socket: WebSocket | null = null;
  private sessionId: string;
  private callbacks: SocketCallbacks;
  private isExplicitlyClosed = false;
  private pendingJson: string[] = [];
  /** PCM frames captured while the socket is down; flushed on reconnect. */
  private audioBuffer: ArrayBuffer[] = [];
  private hasConnectedOnce = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private openPromiseResolve: (() => void) | null = null;

  constructor(sessionId: string, callbacks: SocketCallbacks) {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isExplicitlyClosed = false;
      this.openPromiseResolve = resolve;
      try {
        this.open(reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  private buildUrl(): string {
    const envWs = import.meta.env.VITE_WS_URL;
    let wsUrl = '';
    if (envWs) {
      wsUrl = `${envWs.replace(/\/$/, '')}/ws/transcribe/${this.sessionId}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws/transcribe/${this.sessionId}`;
    }
    return withTokenParam(wsUrl);
  }

  private open(onErrorReject?: (err: unknown) => void): void {
    try {
      this.socket = new WebSocket(this.buildUrl());
      this.socket.binaryType = 'arraybuffer';
      this.lastMessageAt = Date.now();

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.startWatchdog();
        // Flush control messages queued before OPEN (e.g. stop sent early).
        for (const queued of this.pendingJson) {
          try {
            this.socket?.send(queued);
          } catch (e) {
            console.warn('Failed flushing queued WS message:', e);
          }
        }
        this.pendingJson = [];
        // Flush audio captured while disconnected so no speech is lost.
        if (this.audioBuffer.length > 0) {
          const buffered = this.audioBuffer.splice(0, this.audioBuffer.length);
          for (const chunk of buffered) {
            try {
              this.socket?.send(chunk);
            } catch {
              break;
            }
          }
        }
        if (!this.hasConnectedOnce) {
          this.hasConnectedOnce = true;
          this.openPromiseResolve?.();
          this.openPromiseResolve = null;
        } else {
          this.callbacks.onReconnected?.();
        }
      };

      this.socket.onerror = () => {
        try {
          this.socket?.close();
        } catch {
          /* ignore */
        }
        if (!this.hasConnectedOnce && onErrorReject) {
          this.callbacks.onError?.(
            'WS_CONNECTION_ERROR',
            'WebSocket encountered an error connecting to server.'
          );
          onErrorReject(new Error('WebSocket connection error'));
        }
      };

      this.socket.onclose = () => {
        this.stopWatchdog();
        if (this.isExplicitlyClosed) {
          this.callbacks.onClose?.();
          return;
        }
        this.scheduleReconnect();
      };

      this.socket.onmessage = (event) => {
        this.lastMessageAt = Date.now();
        if (typeof event.data !== 'string') return;
        try {
          const msg: InboundWSMessage = JSON.parse(event.data);
          this.handleInboundMessage(msg);
        } catch (e) {
          console.error('Failed to parse inbound WS message:', event.data, e);
        }
      };
    } catch (err) {
      if (onErrorReject) onErrorReject(err);
      else this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isExplicitlyClosed) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.callbacks.onFatal?.(
        'WS_RECONNECT_FAILED',
        'Connection to the server was lost and could not be restored.'
      );
      return;
    }
    this.reconnectAttempts += 1;
    const delay = Math.min(500 * 2 ** (this.reconnectAttempts - 1), 8000);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.isExplicitlyClosed) this.open();
    }, delay);
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastMessageAt > WATCHDOG_SILENCE_MS) {
        // Server appears dead (no heartbeats) — force a close to trigger reconnect.
        try {
          this.socket.close();
        } catch {
          /* ignore */
        }
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private handleInboundMessage(msg: InboundWSMessage) {
    switch (msg.type) {
      case 'connected':
        this.callbacks.onConnected?.(msg.session_id, msg.resumed === true);
        break;
      case 'ping':
        // Answer server heartbeats so it can detect a live peer.
        this.sendJson({ type: 'pong' });
        break;
      case 'pong':
        break;
      case 'transcript.interim':
        this.callbacks.onInterimTranscript?.(msg.text);
        break;
      case 'transcript.final':
        this.callbacks.onFinalLiveSegment?.(msg.text);
        break;
      case 'processing':
        if (msg.stage) {
          this.callbacks.onProcessingStage?.(msg.stage);
        }
        break;
      case 'final_transcript':
        this.callbacks.onFinalTranscript?.(msg.data);
        break;
      case 'summary':
        this.callbacks.onSummary?.(msg.data);
        break;
      case 'complete':
        this.callbacks.onComplete?.();
        break;
      case 'session_limit':
        this.callbacks.onSessionLimit?.(msg.code, msg.message);
        this.callbacks.onError?.(msg.code, msg.message);
        break;
      case 'error':
        this.callbacks.onError?.(msg.code, msg.message);
        break;
    }
  }

  sendJson(msg: OutboundWSMessage) {
    const payload = JSON.stringify(msg);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    } else if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      // Queue control messages (start/stop) so an early stop is never lost.
      this.pendingJson.push(payload);
    } else if (!this.isExplicitlyClosed) {
      // Buffer control messages across reconnect gaps.
      this.pendingJson.push(payload);
      if (this.pendingJson.length > 50) this.pendingJson.shift();
    } else {
      console.warn('Dropped WS message, socket not closed intentionally:', msg.type);
    }
  }

  sendAudioChunk(chunk: ArrayBuffer) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(chunk);
      return;
    }
    // Socket down (reconnecting): buffer a bounded amount of audio so the
    // recording survives transient network drops.
    if (!this.isExplicitlyClosed) {
      this.audioBuffer.push(chunk);
      if (this.audioBuffer.length > MAX_BUFFERED_AUDIO_CHUNKS) {
        this.audioBuffer.shift();
      }
    }
  }

  close() {
    this.isExplicitlyClosed = true;
    this.stopWatchdog();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.audioBuffer = [];
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
