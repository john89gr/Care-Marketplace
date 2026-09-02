import { Injectable, inject, signal, computed } from '@angular/core';
import { SessionStore } from '../../core/auth/session';
import { WebSocketClient, WsEnvelope } from '../../core/services/ws/websocket.client';

export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface ChatMessage {
  id: string;
  conversationId: string;
  authorId: string;
  text: string;
  sentAtMs: number;
  status: MessageStatus;
}

export interface Conversation {
  id: string;
  displayName: string;
  lastMessageAtMs: number;
  unread: number;
}

const STORAGE_KEY = 'cm.chat.v1';
const WS_URL = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws/chat`;

/**
 * Chat state (PLAN.md §5 Phase 1 — Chat): real-time WebSocket sync, unread
 * counters, and localStorage persistence. Conversations are keyed by the
 * peer's user id; incoming messages bump unread until the conversation is
 * opened.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  // Default-parameter injection keeps `new ChatStore(session, ws)` possible in
  // unit tests while remaining DI-friendly in the app.
  constructor(
    private readonly session: SessionStore = inject(SessionStore),
    private readonly ws: WebSocketClient = inject(WebSocketClient)
  ) {
    this._hydrate();
    this.ws.messages$.subscribe((envelope) => this.handleEnvelope(envelope));
    this.ws.connected$.subscribe((connected) => this._connected.set(connected));
  }

  private readonly _conversations = signal<Conversation[]>([]);
  private readonly _messages = signal<Record<string, ChatMessage[]>>({});
  private readonly _activeId = signal<string | null>(null);
  private readonly _connected = signal(false);
  private readonly _sendError = signal('');

  readonly conversations = this._conversations.asReadonly();
  readonly messages = this._messages.asReadonly();
  readonly activeId = this._activeId.asReadonly();
  readonly connected = this._connected.asReadonly();
  readonly sendError = this._sendError.asReadonly();

  readonly totalUnread = computed(() =>
    this._conversations().reduce((sum, c) => sum + c.unread, 0)
  );

  readonly activeMessages = computed<ChatMessage[]>(() => {
    const id = this._activeId();
    return id ? this._messages()[id] ?? [] : [];
  });

  connect(): void {
    this.ws.connect(WS_URL());
  }

  disconnect(): void {
    this.ws.close();
  }

  /** Opens (or creates) a conversation and marks it read. */
  openConversation(id: string, displayName = id): void {
    this._activeId.set(id);
    const existing = this._conversations().find((c) => c.id === id);
    if (!existing) {
      this._conversations.update((list) => [
        { id, displayName, lastMessageAtMs: 0, unread: 0 },
        ...list,
      ]);
    } else if (existing.displayName !== displayName) {
      this._conversations.update((list) =>
        list.map((c) => (c.id === id ? { ...c, displayName } : c))
      );
    }
    this.markRead(id);
  }

  markRead(id: string): void {
    this._conversations.update((list) =>
      list.map((c) => (c.id === id ? { ...c, unread: 0 } : c))
    );
    this._persist();
  }

  send(text: string): void {
    const conversationId = this._activeId();
    if (!conversationId || !text.trim()) {
      return;
    }
    const me = this.session.session();
    if (!me) {
      return;
    }
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId,
      authorId: me.userId,
      text: text.trim(),
      sentAtMs: Date.now(),
      status: 'sending',
    };
    this.appendMessage(message);

    const delivered = this.ws.send({
      type: 'chat.send',
      payload: { conversationId, text: message.text, clientMessageId: message.id },
    });
    this.updateStatus(message.id, delivered ? 'sent' : 'failed');
    if (!delivered) {
      this._sendError.set('Not connected — message will not reach the caregiver yet.');
    } else {
      this._sendError.set('');
    }
  }

  /** Handles envelopes from the chat WebSocket. */
  handleEnvelope(envelope: WsEnvelope): void {
    switch (envelope.type) {
      case 'chat.message': {
        const payload = envelope.payload as {
          conversationId: string;
          authorId: string;
          text: string;
          sentAtMs: number;
        };
        const me = this.session.session();
        const isMine = me !== null && payload.authorId === me.userId;
        this.appendMessage({
          id: crypto.randomUUID(),
          conversationId: payload.conversationId,
          authorId: payload.authorId,
          text: payload.text,
          sentAtMs: payload.sentAtMs,
          status: 'sent',
        });
        if (!isMine) {
          this._bumpUnread(payload.conversationId);
        }
        break;
      }
      case 'chat.ack': {
        const payload = envelope.payload as { clientMessageId?: string };
        if (payload?.clientMessageId) {
          this.updateStatus(payload.clientMessageId, 'sent');
        }
        break;
      }
    }
  }

  appendMessage(message: ChatMessage): void {
    this._messages.update((all) => ({
      ...all,
      [message.conversationId]: [...(all[message.conversationId] ?? []), message],
    }));
    this._touchConversation(message.conversationId, message.sentAtMs);
    this._persist();
  }

  private updateStatus(messageId: string, status: MessageStatus): void {
    this._messages.update((all) => {
      const next: Record<string, ChatMessage[]> = {};
      for (const [id, list] of Object.entries(all)) {
        next[id] = list.map((m) => (m.id === messageId ? { ...m, status } : m));
      }
      return next;
    });
    this._persist();
  }

  private _touchConversation(id: string, sentAtMs: number): void {
    this._conversations.update((list) => {
      const existing = list.find((c) => c.id === id);
      const updated = existing
        ? list.map((c) => (c.id === id ? { ...c, lastMessageAtMs: sentAtMs } : c))
        : [{ id, displayName: id, lastMessageAtMs: sentAtMs, unread: 0 }, ...list];
      return updated.sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs);
    });
  }

  private _bumpUnread(conversationId: string): void {
    if (this._activeId() === conversationId) {
      return;
    }
    this._conversations.update((list) =>
      list.map((c) => (c.id === conversationId ? { ...c, unread: c.unread + 1 } : c))
    );
    this._persist();
  }

  private _persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          conversations: this._conversations(),
          messages: this._messages(),
        })
      );
    } catch {
      // Storage unavailable — state stays in memory only.
    }
  }

  private _hydrate(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        conversations?: Conversation[];
        messages?: Record<string, ChatMessage[]>;
      };
      if (Array.isArray(parsed.conversations)) {
        this._conversations.set(
          parsed.conversations.filter((c) => c && typeof c.id === 'string')
        );
      }
      if (parsed.messages && typeof parsed.messages === 'object') {
        this._messages.set(parsed.messages);
      }
    } catch {
      // Corrupted storage — start clean.
    }
  }
}
