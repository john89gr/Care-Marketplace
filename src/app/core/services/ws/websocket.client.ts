import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

/**
 * Protocol envelope exchanged over the chat WebSocket.
 * The backend contract is intentionally small (PLAN.md §5 Phase 1 — Chat):
 *   client -> server: { type: 'chat.send', payload: { conversationId, text, clientMessageId } }
 *   server -> client: { type: 'chat.message', payload: { conversationId, authorId, text, sentAtMs } }
 *   server -> client: { type: 'chat.ack', payload: { clientMessageId } }
 */
export interface WsEnvelope {
  type: string;
  payload?: Record<string, unknown>;
}

export type SocketFactory = (url: string) => WebSocket;

/** Default factory — kept separate so tests can inject a fake WebSocket. */
export const browserSocketFactory: SocketFactory = (url) => new WebSocket(url);

/**
 * Thin RxJS wrapper over the browser WebSocket with automatic reconnection.
 */
@Injectable({ providedIn: 'root' })
export class WebSocketClient {
  private readonly _messages = new Subject<WsEnvelope>();
  private readonly _connected = new BehaviorSubject(false);
  private socket: WebSocket | null = null;
  private url = '';
  private manualClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  readonly messages$ = this._messages.asObservable();
  readonly connected$ = this._connected.asObservable();

  /** Overridable in tests to inject a fake WebSocket. */
  socketFactory: SocketFactory = browserSocketFactory;

  constructor() {}

  connect(url: string): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.url = url;
    this.manualClose = false;
    this.open();
  }

  send(envelope: WsEnvelope): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(envelope));
    return true;
  }

  close(): void {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this._connected.next(false);
  }

  private open(): void {
    let socket: WebSocket;
    try {
      socket = this.socketFactory(this.url);
    } catch {
      this._connected.next(false);
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      this._connected.next(true);
    };

    socket.onmessage = (event) => {
      try {
        const envelope = JSON.parse(String(event.data)) as WsEnvelope;
        this._messages.next(envelope);
      } catch {
        // Ignore malformed frames.
      }
    };

    socket.onerror = () => {
      // onclose always follows; reconnection is handled there.
    };

    socket.onclose = () => {
      this._connected.next(false);
      if (this.manualClose) {
        return;
      }
      // Exponential backoff, capped at 30s.
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
      this.reconnectAttempts += 1;
      this.reconnectTimer = setTimeout(() => this.open(), delay);
    };
  }
}
