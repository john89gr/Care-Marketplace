import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

/**
 * Protocol envelope exchanged over the chat WebSocket.
 * The backend contract is intentionally small (PLAN.md §5 Phase 1 — Chat):
 *   client -> server: { type: 'chat.send', payload: { conversationId, text, clientMessageId } }
 *   server -> client: { type: 'chat.message', payload: { conversationId, authorId, text, sentAtMs } }
 *   server -> client: { type: 'chat.ack', payload: { clientMessageId } }
 *
 * Chat v2 additions (FEATURE_PLAN.md §18):
 *   client -> server: { type: 'chat.typing', payload: { conversationId, userId, isTyping } }
 *   server -> peer:   { type: 'chat.typing', payload: { conversationId, userId, isTyping } }
 *   client -> server: { type: 'chat.react', payload: { messageId, emoji, added } }
 *   server -> peer:   { type: 'chat.react', payload: { messageId, emoji, added } }
 *   client -> server: { type: 'chat.read_receipt', payload: { conversationId, messageIds } }
 *   server -> peer:   { type: 'chat.read_receipt', payload: { conversationId, messageIds } }
 *
 * Notifications (FEATURE_PLAN.md §4) reuse this shared client as a
 * `notifications` channel:
 *   client -> server: { type: 'notification.poll', payload: {} }
 *   server -> client: { type: 'notification.push', payload: AppNotification }
 */
export interface WsEnvelope {
  type: string;
  payload?: Record<string, unknown>;
}

/** Live typing presence event broadcast over the chat channel. */
export interface WsTypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
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
  /** Dedicated stream for live typing presence (chat-typing channel). */
  private readonly _typing = new Subject<WsTypingEvent>();
  private readonly _connected = new BehaviorSubject(false);
  private socket: WebSocket | null = null;
  private url = '';
  private manualClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  readonly messages$ = this._messages.asObservable();
  readonly typing$ = this._typing.asObservable();
  readonly connected$ = this._connected.asObservable();

  /** Overridable in tests to inject a fake WebSocket. */
  socketFactory: SocketFactory = browserSocketFactory;

  constructor() {}

  connect(url: string): void {
    // Same URL already open/opening: nothing to do. A different URL (chat vs
    // visits vs notifications channels share this client) reconnects.
    if (
      this.socket &&
      this.url === url &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    if (this.socket) {
      this.manualClose = true;
      this.socket.close();
      this.socket = null;
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

  /** Send a typing-presence frame; returns false if the socket is closed. */
  sendTyping(conversationId: string, userId: string, isTyping: boolean): boolean {
    return this.send({
      type: 'chat.typing',
      payload: { conversationId, userId, isTyping },
    });
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
        if (envelope.type === 'chat.typing') {
          this._typing.next(envelope.payload as unknown as WsTypingEvent);
        } else {
          this._messages.next(envelope);
        }
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
