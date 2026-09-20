import type { InboundWSMessage, OutboundWSMessage } from '../types/transcription';

export interface SocketCallbacks {
  onConnected?: (sessionId: string) => void;
  onInterimTranscript?: (text: string) => void;
  onFinalLiveSegment?: (text: string) => void;
  onProcessingStage?: (stage: string) => void;
  onFinalTranscript?: (data: any) => void;
  onSummary?: (data: any) => void;
  onComplete?: () => void;
  onError?: (code: string, message: string) => void;
  onClose?: () => void;
}

export class TranscriptionSocket {
  private socket: WebSocket | null = null;
  private sessionId: string;
  private callbacks: SocketCallbacks;
  private isExplicitlyClosed = false;

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
          resolve();
        };

        this.socket.onerror = (err) => {
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
      case 'error':
        this.callbacks.onError?.(msg.code, msg.message);
        break;
    }
  }

  sendJson(msg: OutboundWSMessage) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  sendAudioChunk(chunk: ArrayBuffer) {
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
