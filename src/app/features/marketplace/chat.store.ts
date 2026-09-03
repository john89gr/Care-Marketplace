import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { SessionStore } from '../../core/auth/session';
import { WebSocketClient, WsEnvelope, WsTypingEvent } from '../../core/services/ws/websocket.client';

/** 1 MB — used to format attachment sizes in the UI. */
export const MB = 1024 * 1024;

/** Maximum upload size for attachments (FEATURE_PLAN.md §18 subtask 3). */
export const MAX_ATTACHMENT_SIZE = 10 * MB;

export type MessageStatus = 'sending' | 'sent' | 'failed';

export type AttachmentKind = 'image' | 'pdf' | 'voice';

export interface ChatAttachment {
  kind: AttachmentKind;
  url: string;
  name: string;
  sizeBytes: number;
}

/** Resolve the attachment kind from a file's MIME type. Returns null if unsupported. */
export function attachmentKindForType(file: File): AttachmentKind | null {
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('audio/')) return 'voice';
  return null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  authorId: string;
  text: string;
  sentAtMs: number;
  status: MessageStatus;
  /** v2: file/image/voice attachment (FEATURE_PLAN.md §18 subtask 1). */
  attachment?: ChatAttachment;
  /** v2: reactions aggregated by emoji char → count. */
  reactions: Record<string, number>;
  /** v2: server-delivered ack (delivered to recipient device). */
  deliveredAtMs?: number;
  /** v2: recipient read this message (read by the other party). */
  readAtMs?: number;
  /** v2: inline booking context card reference. */
  bookingId?: string;
}

export interface Conversation {
  id: string;
  displayName: string;
  lastMessageAtMs: number;
  unread: number;
}

/** Options accepted by `send` for the v2 message envelope. */
export interface SendOptions {
  attachment?: ChatAttachment;
  bookingId?: string;
}

/** Lifecycle of a file upload tracked inside the store (not persisted). */
export type UploadStatus = 'uploading' | 'success' | 'error';

export interface ChatUpload {
  id: string;
  progress: number;
  status: UploadStatus;
  /** Human-readable error when status === 'error'. */
  error?: string;
  /** Resolved attachment once the upload succeeds. */
  attachment?: ChatAttachment;
}

const STORAGE_KEY = 'cm.chat.v2';
const WS_URL = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws/chat`;

/**
 * Chat state (PLAN.md §5 Phase 1 — Chat): real-time WebSocket sync, unread
 * counters, and localStorage persistence. Conversations are keyed by the
 * peer's user id; incoming messages bump unread until the conversation is
 * opened.
 *
 * Chat v2 (FEATURE_PLAN.md §18): attachments + upload progress, emoji
 * reactions with count aggregation, typing presence over a dedicated WS
 * channel, per-message read receipts, and inline booking-context cards.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  // Default-parameter injection keeps `new ChatStore(session, ws)` possible in
  // unit tests while remaining DI-friendly in the app.
  constructor(
    private readonly session: SessionStore = inject(SessionStore),
    private readonly ws: WebSocketClient = inject(WebSocketClient),
    private readonly http: HttpClient = inject(HttpClient)
  ) {
    this._hydrate();
    this.ws.messages$.subscribe((envelope) => this.handleEnvelope(envelope));
    this.ws.typing$.subscribe((event) => this._handleTyping(event));
    this.ws.connected$.subscribe((connected) => this._connected.set(connected));
  }

  private readonly _conversations = signal<Conversation[]>([]);
  private readonly _messages = signal<Record<string, ChatMessage[]>>({});
  private readonly _activeId = signal<string | null>(null);
  private readonly _connected = signal(false);
  private readonly _sendError = signal('');
  private readonly _uploads = signal<Record<string, ChatUpload>>({});
  /** conversationId → Set of peer user ids currently typing. */
  private readonly _typing = signal<Record<string, Set<string>>>({});
  /** Abort controllers for in-flight uploads (cancel support). */
  private readonly _uploadControllers = new Map<string, AbortController>();
  private readonly _uploadSubs = new Map<string, Subscription>();

  readonly conversations = this._conversations.asReadonly();
  readonly messages = this._messages.asReadonly();
  readonly activeId = this._activeId.asReadonly();
  readonly connected = this._connected.asReadonly();
  readonly sendError = this._sendError.asReadonly();
  readonly uploads = this._uploads.asReadonly();

  readonly totalUnread = computed(() =>
    this._conversations().reduce((sum, c) => sum + c.unread, 0)
  );

  readonly activeMessages = computed<ChatMessage[]>(() => {
    const id = this._activeId();
    return id ? this._messages()[id] ?? [] : [];
  });

  /** Peer user ids currently typing in the active conversation (excludes self). */
  readonly typingUsers = computed<string[]>(() => {
    const activeId = this._activeId();
    const me = this.session.session()?.userId ?? '';
    if (!activeId) return [];
    const set = this._typing()[activeId] ?? new Set();
    return [...set].filter((u) => u !== me);
  });

  /**
   * Upload progress + status for a given upload id.
   */
  readonly uploadProgress = (id: string): number => this._uploads()[id]?.progress ?? 0;

  /**
   * Upload an attachment file. Returns an upload id the caller can use with
   * `uploads()` to read progress / status / the resolved attachment URL.
   * Files exceeding {@link MAX_ATTACHMENT_SIZE} or with unsupported types are
   * rejected client-side and reported as `status: 'error'` without an HTTP call.
   */
  uploadAttachment(file: File): string {
    const id = crypto.randomUUID();
    const kind = attachmentKindForType(file);
    if (!kind) {
      this._uploads.update((up) => ({
        ...up,
        [id]: { id, progress: 0, status: 'error', error: 'Unsupported file type.' },
      }));
      return id;
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
      const mb = (file.size / MB).toFixed(1);
      this._uploads.update((up) => ({
        ...up,
        [id]: {
          id,
          progress: 0,
          status: 'error',
          error: `File exceeds the 10 MB limit (${mb} MB).`,
        },
      }));
      return id;
    }

    const controller = new AbortController();
    this._uploadControllers.set(id, controller);
    this._uploadFiles.set(id, file);

    const formData = new FormData();
    formData.append('file', file);

    this._uploads.update((up) => ({
      ...up,
      [id]: { id, progress: 0, status: 'uploading' },
    }));

    const sub = this.http
      .request<UploadResponse>('POST', '/api/uploads', {
        body: formData,
        reportProgress: true,
        observe: 'events',
        signal: controller.signal,
      })
      .subscribe({
        next: (event: HttpEvent<UploadResponse>) => {
          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total ?? file.size;
            const progress = total > 0 ? Math.round((100 * (event.loaded ?? 0)) / total) : 0;
            this._uploads.update((up) => ({
              ...up,
              [id]: { ...up[id], progress, status: 'uploading' },
            }));
          } else if (event instanceof HttpResponse && event.body) {
            const attachment: ChatAttachment = {
              kind: event.body.kind,
              url: event.body.url,
              name: event.body.name,
              sizeBytes: event.body.sizeBytes,
            };
            this._uploads.update((up) => ({
              ...up,
              [id]: { id, progress: 100, status: 'success', attachment },
            }));
            this._uploadControllers.delete(id);
          }
        },
        error: (_err: unknown) => {
          this._uploads.update((up) => ({
            ...up,
            [id]: {
              id,
              progress: 0,
              status: 'error',
              error: 'Upload failed. Please try again.',
            },
          }));
          this._uploadControllers.delete(id);
        },
      });

    this._uploadSubs.set(id, sub);
    return id;
  }

  /** Abort an in-flight upload and mark it cancelled. */
  cancelUpload(id: string): void {
    const controller = this._uploadControllers.get(id);
    if (controller) {
      controller.abort();
      this._uploadControllers.delete(id);
    }
    const sub = this._uploadSubs.get(id);
    if (sub) {
      sub.unsubscribe();
      this._uploadSubs.delete(id);
    }
    this._uploads.update((up) => {
      const current = up[id];
      if (!current) return up;
      return {
        ...up,
        [id]: { ...current, status: 'error', error: 'Upload cancelled.' },
      };
    });
  }

  /** Retry a previously failed upload (re-uses the original File). */
  retryUpload(id: string): void {
    const file = this._uploadFiles.get(id);
    if (!file) return;
    this._uploads.update((up) => {
      const current = up[id];
      if (!current) return up;
      return { ...up, [id]: { ...current, progress: 0, status: 'uploading', error: undefined } };
    });
    this._doUpload(id, file);
  }

  /** Remove a finished/failed upload from the UI state. */
  clearUpload(id: string): void {
    this._uploads.update((up) => {
      const next = { ...up };
      delete next[id];
      return next;
    });
  }

  /**
   * Files retained for retry. In a full implementation uploads would survive
   * page navigations via a shared service; here we keep a transient map.
   */
  private readonly _uploadFiles = new Map<string, File>();

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
    // v2: stamp readAtMs on incoming messages that haven't been read yet,
    // then notify the peer so their sent-tick updates to "read".
    const me = this.session.session();
    const now = Date.now();
    const readIds: string[] = [];
    this._messages.update((all) => {
      const conv = all[id] ?? [];
      const next = conv.map((m) => {
        if (m.authorId !== me?.userId && !m.readAtMs) {
          readIds.push(m.id);
          return { ...m, readAtMs: now };
        }
        return m;
      });
      return { ...all, [id]: next };
    });
    if (readIds.length > 0) {
      this.ws.send({
        type: 'chat.read_receipt',
        payload: { conversationId: id, messageIds: readIds },
      });
    }
    this._persist();
  }

  /**
   * Send a text message, optionally with an attachment or booking context
   * (FEATURE_PLAN.md §18 subtask 6/1).
   */
  send(text: string, options?: SendOptions): void {
    const conversationId = this._activeId();
    if (!conversationId) {
      return;
    }
    if (!text.trim() && !options?.attachment) {
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
      reactions: {},
    };
    if (options?.attachment) {
      message.attachment = options.attachment;
    }
    if (options?.bookingId) {
      message.bookingId = options.bookingId;
    }
    this.appendMessage(message);

    const payload: Record<string, unknown> = {
      conversationId,
      text: message.text,
      clientMessageId: message.id,
    };
    if (message.attachment) {
      payload.attachment = message.attachment;
    }
    if (message.bookingId) {
      payload.bookingId = message.bookingId;
    }

    const delivered = this.ws.send({ type: 'chat.send', payload });
    this.updateStatus(message.id, delivered ? 'sent' : 'failed');
    if (!delivered) {
      this._sendError.set('Not connected — message will not reach the caregiver yet.');
    } else {
      this._sendError.set('');
    }
  }

  /** Notify the server that the current user has started/stopped typing. */
  startTyping(): void {
    const conv = this._activeId();
    const me = this.session.session();
    if (!conv || !me) return;
    this.ws.sendTyping(conv, me.userId, true);
  }

  stopTyping(): void {
    const conv = this._activeId();
    const me = this.session.session();
    if (!conv || !me) return;
    this.ws.sendTyping(conv, me.userId, false);
  }

  /** Add an emoji reaction to a message (sends a WS frame to the peer). */
  addReaction(messageId: string, emoji: string): void {
    this._applyReaction(messageId, emoji, 1);
    this._broadcastReaction(messageId, emoji, true);
  }

  /** Remove an emoji reaction from a message. */
  removeReaction(messageId: string, emoji: string): void {
    this._applyReaction(messageId, emoji, -1);
    this._broadcastReaction(messageId, emoji, false);
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
          attachment?: ChatAttachment;
          reactions?: Record<string, number>;
          bookingId?: string;
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
          reactions: payload.reactions ?? {},
          ...(payload.attachment ? { attachment: payload.attachment } : {}),
          ...(payload.bookingId ? { bookingId: payload.bookingId } : {}),
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
      case 'chat.react': {
        const payload = envelope.payload as { messageId: string; emoji: string; added: boolean };
        this._applyReaction(payload.messageId, payload.emoji, payload.added ? 1 : -1);
        break;
      }
      case 'chat.read_receipt': {
        const payload = envelope.payload as { conversationId: string; messageIds: string[] };
        const me = this.session.session();
        // Only mark MY outgoing messages as read-by-peer.
        if (!me) break;
        const now = Date.now();
        const set = new Set(payload.messageIds);
        this._messages.update((all) => {
          const conv = all[payload.conversationId] ?? [];
          const next = conv.map((m) =>
            m.authorId === me.userId && set.has(m.id) && !m.readAtMs
              ? { ...m, readAtMs: now }
              : m
          );
          return { ...all, [payload.conversationId]: next };
        });
        this._persist();
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

  private _applyReaction(messageId: string, emoji: string, delta: number): void {
    this._messages.update((all) => {
      const next: Record<string, ChatMessage[]> = {};
      for (const [id, list] of Object.entries(all)) {
        next[id] = list.map((m) => {
          if (m.id !== messageId) return m;
          const current = m.reactions[emoji] ?? 0;
          return {
            ...m,
            reactions: { ...m.reactions, [emoji]: Math.max(0, current + delta) },
          };
        });
      }
      return next;
    });
    this._persist();
  }

  private _broadcastReaction(messageId: string, emoji: string, added: boolean): void {
    this.ws.send({
      type: 'chat.react',
      payload: { messageId, emoji, added },
    });
  }

  private _handleTyping(event: WsTypingEvent): void {
    if (event.userId === this.session.session()?.userId) return;
    this._typing.update((map) => {
      const users = new Set(map[event.conversationId] ?? []);
      if (event.isTyping) {
        users.add(event.userId);
      } else {
        users.delete(event.userId);
      }
      return { ...map, [event.conversationId]: users };
    });
    // Auto-clear after a timeout so a dropped stop-frame doesn't pin "typing" forever.
    if (event.isTyping) {
      clearTimeout(this._typingTimers[event.conversationId]);
      this._typingTimers[event.conversationId] = setTimeout(() => {
        this._typing.update((map) => {
          const users = new Set(map[event.conversationId] ?? []);
          users.delete(event.userId);
          return { ...map, [event.conversationId]: users };
        });
        delete this._typingTimers[event.conversationId];
      }, 3_000);
    }
  }

  private _typingTimers: Record<string, ReturnType<typeof setTimeout>> = {};

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
        // Normalize v1 messages: ensure `reactions` is present.
        const normalized: Record<string, ChatMessage[]> = {};
        for (const [id, list] of Object.entries(parsed.messages)) {
          if (Array.isArray(list)) {
            normalized[id] = list.map((m) => ({
              reactions: {},
              ...(m as ChatMessage),
            }));
          }
        }
        this._messages.set(normalized);
      }
    } catch {
      // Corrupted storage — start clean.
    }
  }
}

/** Response shape from `POST /uploads`. */
interface UploadResponse {
  url: string;
  name: string;
  sizeBytes: number;
  kind: AttachmentKind;
}
