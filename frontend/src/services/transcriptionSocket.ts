import type { InboundWSMessage, OutboundWSMessage } from '../types/transcription';

export interface SocketCallbacks {
  onConnected?: (sessionId: string) => void;
  onInterimTranscript?: (text: string) => void;
  onFinalLiveSegment?: (text: string) => void;
  onProcessingStage?: (stage: string) => void;
  onFinalTranscript?: (data: any) => void;
  onSummary?: (data: any) => void;
  onComplete?: () => void;
  onSessionLimit?: (code: string, message: string) => void;
  onError?: (code: string, message: string) => void;
  onClose?: () => void;
}

export class TranscriptionSocket {
  private socket: WebSocket | null = null;
  private sessionId: string;
  private callbacks: SocketCallbacks;
  private isExplicitlyClosed = false;
  private pendingJson: string[] = [];

  constructor(sessionId: string, callbacks: SocketCallbacks) {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.isExplicitlyClosed = false;

      // Determine backend WS URL
      const envWs = import.meta.env.VITE_WS_URL;
      let wsUrl = '';
      if (envWs) {
        wsUrl = `${envWs.replace(/\/$/, '')}/ws/transcribe/${this.sessionId}`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Connect via Vite proxy (port 5173 -> 8001) or direct 8001
        wsUrl = `${protocol}//${window.location.host}/ws/transcribe/${this.sessionId}`;
      }

      try {
        this.socket = new WebSocket(wsUrl);
        this.socket.binaryType = 'arraybuffer';

        this.socket.onopen = () => {
          // Flush control messages queued before OPEN (e.g. stop sent early).
          for (const queued of this.pendingJson) {
            try {
              this.socket?.send(queued);
            } catch (e) {
              console.warn('Failed flushing queued WS message:', e);
            }
          }
          this.pendingJson = [];
          resolve();
        };

        this.socket.onerror = (err) => {
          try {
            this.socket?.close();
          } catch {}
          if (this.callbacks.onError) {
            this.callbacks.onError('WS_CONNECTION_ERROR', 'WebSocket encountered an error connecting to server.');
          }
          reject(err);
        };

        this.socket.onclose = () => {
          if (!this.isExplicitlyClosed && this.callbacks.onClose) {
            this.callbacks.onClose();
          }
        };

        this.socket.onmessage = (event) => {
          if (typeof event.data === 'string') {
            try {
              const msg: InboundWSMessage = JSON.parse(event.data);
              this.handleInboundMessage(msg);
            } catch (e) {
              console.error("Failed to parse inbound WS message:", event.data, e);
            }
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleInboundMessage(msg: InboundWSMessage) {
    switch (msg.type) {
      case 'connected':
        this.callbacks.onConnected?.(msg.session_id);
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
        // Emitted before forced stop when a server-side limit is hit (e.g. max duration)
        this.callbacks.onSessionLimit?.(msg.code, msg.message);
        // Fall through to error handling so legacy consumers also see it
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
    } else {
      console.warn('Dropped WS message, socket not open:', msg.type);
    }
  }

  sendAudioChunk(chunk: ArrayBuffer) {
    // Audio is real-time only; drop when not open to avoid unbounded backlog.
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(chunk);
    }
  }

  close() {
    this.isExplicitlyClosed = true;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
