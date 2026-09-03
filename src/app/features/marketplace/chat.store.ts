import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpResponse, HttpEventType, type HttpEvent } from '@angular/common/http';
import { Observable, of, type Subscription } from 'rxjs';
import { SessionStore } from '../../core/auth/session';
import { WebSocketClient, WsEnvelope } from '../../core/services/ws/websocket.client';

export type MessageStatus = 'sending' | 'sent' | 'failed';

/** v2: attachment kinds accepted in chat (FEATURE_PLAN.md §18). */
export type AttachmentKind = 'image' | 'pdf' | 'voice';

export interface Attachment {
  kind: AttachmentKind;
  url: string;
  name: string;
  sizeMs: number;
}

export type ReactionCounts = Record<string, number>;

export interface ChatMessage {
  id: string;
  conversationId: string;
  authorId: string;
  text: string;
  sentAtMs: number;
  status: MessageStatus;
  /** v2: attachment payload (image / pdf / voice). */
  attachment?: Attachment;
  /** v2: read-receipt timestamps. */
  deliveredAtMs?: number | null;
  readAtMs?: number | null;
  /** v2: aggregated reactions keyed by emoji. */
  reactions?: ReactionCounts;
  /** v2: optional booking-context reference rendered as an inline card. */
  bookingId?: string | null;
}

export interface Conversation {
  id: string;
  displayName: string;
  lastMessageAtMs: number;
  unread: number;
  /** v2: peer user ids currently typing in this conversation. */
  typingIds: string[];
}

/** 10 MB cap for chat attachments (subtask 3). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Duration cap for recorded voice notes (subtask 5). */
export const VOICE_NOTE_MAX_MS = 60_000;

/** Type allowlist (subtask 3); maps a MIME type to its attachment kind. */
export const ALLOWED_ATTACHMENT_TYPES: Readonly<Record<AttachmentKind, readonly string[]>> = {
  image: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'],
  pdf: ['application/pdf'],
  voice: ['audio/webm', 'audio/webm;codecs=opus'],
};

export interface AttachmentResult {
  valid: boolean;
  error: string | null;
  kind: AttachmentKind | null;
}

/** Maps a MIME type to an attachment kind, or null if unsupported. */
export function attachmentKindFor(type: string): AttachmentKind | null {
  for (const [kind, types] of Object.entries(ALLOWED_ATTACHMENT_TYPES)) {
    if (types.includes(type)) {
      return kind as AttachmentKind;
    }
  }
  return null;
}

/** Validates a file for size + type before upload (subtask 3). Pure. */
export function validateAttachment(file: File): AttachmentResult {
  const kind = attachmentKindFor(file.type);
  if (kind === null) {
    return {
      valid: false,
      error: 'Unsupported file type. Allowed: images, PDF, and voice notes.',
      kind: null,
    };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { valid: false, error: 'File is larger than the 10 MB limit.', kind };
  }
  return { valid: true, error: null, kind };
}

/** Minimal shape the chat needs to render a booking-context card (subtask 6). */
export interface BookingContextCard {
  id: string;
  status: string;
  caregiverName: string;
  clientName: string;
  scheduledAtMs: number;
  note: string;
}

/** Resolves a booking-context card from a message + the booking roster (subtask 6). */
export function resolveBookingContext(
  message: ChatMessage,
  bookings: ReadonlyArray<BookingContextCard>
): BookingContextCard | null {
  if (!message.bookingId) {
    return null;
  }
  return bookings.find((b) => b.id === message.bookingId) ?? null;
}

/** Sums reaction counts across messages (subtask 9 aggregation). Pure. */
export function aggregateReactions(messages: ReadonlyArray<ChatMessage>): ReactionCounts {
  const totals: ReactionCounts = {};
  for (const msg of messages) {
    const reactions = msg.reactions;
    if (!reactions) {
      continue;
    }
    for (const [emoji, count] of Object.entries(reactions)) {
      totals[emoji] = (totals[emoji] ?? 0) + count;
    }
  }
  return totals;
}

interface UploadState {
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error: string | null;
}

const STORAGE_KEY = 'cm.chat.v2';
const WS_URL = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws/chat`;

/**
 * Chat state (PLAN.md §5 Phase 1 + FEATURE_PLAN.md §18 Chat v2). Real-time
 * WebSocket sync, unread counters, v2 attachments/voice/typing/receipts/
 * reactions/booking-context, and localStorage persistence. Conversations are
 * keyed by the peer's user id; incoming messages bump unread until the
 * conversation is opened.
 */
@Injectable({ providedIn: 'root' })
export class ChatStore {
  // Default-parameter injection keeps `new ChatStore(session, ws, http)` possible
  // in unit tests while remaining DI-friendly in the app.
  constructor(
    private readonly session: SessionStore = inject(SessionStore),
    private readonly ws: WebSocketClient = inject(WebSocketClient),
    private readonly http: HttpClient = inject(HttpClient)
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
  /** In-flight uploads keyed by the optimistic message id (subtask 3). */
  private readonly _uploads = signal<Record<string, UploadState>>({});
  /** User ids the current user has blocked (subtask 11). */
  private readonly _blockedIds = signal<Set<string>>(new Set());
  /** Live subscriptions to in-flight uploads, keyed by message id (subtask 3). */
  private readonly _uploadSubs = new Map<string, Subscription>();
  /** Typing timers so idle peers stop showing "…is typing" (subtask 7). */
  private readonly _typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly conversations = this._conversations.asReadonly();
  readonly messages = this._messages.asReadonly();
  readonly activeId = this._activeId.asReadonly();
  readonly connected = this._connected.asReadonly();
  readonly sendError = this._sendError.asReadonly();
  readonly uploads = this._uploads.asReadonly();
  readonly blockedIds = this._blockedIds.asReadonly();

  readonly totalUnread = computed(() =>
    this._conversations().reduce((sum, c) => sum + c.unread, 0)
  );

  readonly activeMessages = computed<ChatMessage[]>(() => {
    const id = this._activeId();
    return id ? this._messages()[id] ?? [] : [];
  });

  /** Peers currently typing in the active conversation (subtask 7). */
  readonly typingInActive = computed<string[]>(() => {
    const id = this._activeId();
    const conv = this._conversations().find((c) => c.id === id);
    const me = this.session.session()?.userId ?? '';
    return conv ? conv.typingIds.filter((u) => u !== me) : [];
  });

  connect(): void {
    this.ws.connect(WS_URL());
  }

  disconnect(): void {
    this.ws.close();
  }

  /** Opens (or creates) a conversation and marks it read. */
  openConversation(id: string, displayName = id): void {
    this.clearTyping(id);
    this._activeId.set(id);
    const existing = this._conversations().find((c) => c.id === id);
    if (!existing) {
      this._conversations.update((list) => [
        { id, displayName, lastMessageAtMs: 0, unread: 0, typingIds: [] },
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
    const now = Date.now();
    this._conversations.update((list) =>
      list.map((c) => (c.id === id ? { ...c, unread: 0, typingIds: [] } : c))
    );
    // Read receipts (subtask 8): mark the peer's messages read locally, then
    // push a WS ack so the other side can reflect it.
    this._messages.update((all) => {
      const list = all[id];
      if (!list) {
        return all;
      }
      const me = this.session.session()?.userId ?? '';
      const next = list.map((m) =>
        m.authorId !== me && (m.readAtMs == null || m.readAtMs < now)
          ? { ...m, readAtMs: now }
          : m
      );
      return { ...all, [id]: next };
    });
    this._persist();
    this.ws.send({ type: 'chat.read', payload: { conversationId: id, readAtMs: now } });
  }

  /** Notify the server that the user is typing (subtask 7). */
  startTyping(): void {
    const conversationId = this._activeId();
    if (!conversationId) {
      return;
    }
    this.ws.send({ type: 'chat.typing', payload: { conversationId, typing: true } });
  }

  /** Stop announcing typing state (subtask 7). */
  stopTyping(): void {
    const conversationId = this._activeId();
    if (!conversationId) {
      return;
    }
    this.ws.send({ type: 'chat.typing', payload: { conversationId, typing: false } });
  }

  private clearTyping(conversationId: string): void {
    this._conversations.update((list) =>
      list.map((c) => (c.id === conversationId ? { ...c, typingIds: [] } : c))
    );
    for (const timer of this._typingTimers.values()) {
      clearTimeout(timer);
    }
    this._typingTimers.clear();
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
      reactions: {},
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

  /** Optimistic send of an attachment with upload progress (subtasks 1, 3, 13). */
  sendAttachment(file: File): void {
    const conversationId = this._activeId();
    if (!conversationId) {
      this._sendError.set('Open a conversation before attaching a file.');
      return;
    }
    const me = this.session.session();
    if (!me) {
      return;
    }
    const validation = validateAttachment(file);
    if (!validation.valid || !validation.kind) {
      this._sendError.set(validation.error ?? 'Invalid file.');
      return;
    }
    const kind = validation.kind;
    this._sendError.set('');

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId,
      authorId: me.userId,
      text: '',
      sentAtMs: Date.now(),
      status: 'sending',
      attachment: {
        kind,
        url: this._previewUrl(file),
        name: file.name,
        sizeMs: file.size,
      },
      reactions: {},
    };
    this.appendMessage(message);
    this._uploads.update((u) => ({
      ...u,
      [message.id]: { progress: 0, status: 'uploading', error: null },
    }));

    const form = new FormData();
    form.append('file', file);

    this._uploadSubs.set(
      message.id,
      this.http
        .request('POST', '/api/uploads', {
          body: form,
          observe: 'events',
          reportProgress: true,
          responseType: 'json',
        })
        .subscribe({
        next: (event: HttpEvent<unknown>) => {
          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total ?? event.loaded;
            const progress = total > 0 ? Math.round((100 * event.loaded) / total) : 0;
            this._uploads.update((u) =>
              u[message.id] ? { ...u, [message.id]: { ...u[message.id], progress } } : u
            );
          } else if (event instanceof HttpResponse) {
            const body = event.body as { url: string; name: string; sizeMs: number; kind?: AttachmentKind } | null;
            if (body?.url) {
              this._replaceAttachment(message.id, {
                kind: body.kind ?? kind,
                url: body.url,
                name: body.name ?? file.name,
                sizeMs: body.sizeMs ?? file.size,
              });
              this._uploads.update((u) =>
                u[message.id] ? { ...u, [message.id]: { progress: 100, status: 'done', error: null } } : u
              );
              this._deliverMessage(message, conversationId);
            } else {
              this._failUpload(message.id, conversationId, 'Upload did not return a URL.');
            }
          }
        },
        error: () => {
          this._failUpload(message.id, conversationId, 'Upload failed. Tap to retry.');
        },
        complete: () => {
          this._uploadSubs.delete(message.id);
        },
      })
    );
  }

  /** Send a booking-context card (subtask 6). */
  sendBookingContext(bookingId: string, booking?: BookingContextCard): void {
    const conversationId = this._activeId();
    if (!conversationId) {
      this._sendError.set('Open a conversation before sharing context.');
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
      text: booking ? `${booking.caregiverName} — ${booking.note}` : `Booking ${bookingId}`,
      sentAtMs: Date.now(),
      status: 'sending',
      bookingId,
      reactions: {},
    };
    this.appendMessage(message);
    const delivered = this.ws.send({
      type: 'chat.send',
      payload: { conversationId, text: message.text, bookingId, clientMessageId: message.id },
    });
    this.updateStatus(message.id, delivered ? 'sent' : 'failed');
  }

  /** React to a message (subtask 9). */
  react(messageId: string, emoji: string): void {
    this._messages.update((all) => {
      const next: Record<string, ChatMessage[]> = {};
      for (const [id, list] of Object.entries(all)) {
        next[id] = list.map((m) => {
          if (m.id !== messageId) {
            return m;
          }
          const current = m.reactions ?? {};
          return { ...m, reactions: { ...current, [emoji]: (current[emoji] ?? 0) + 1 } };
        });
      }
      return next;
    });
    this._persist();
    this.ws.send({ type: 'chat.reaction', payload: { messageId, emoji } });
  }

  /** Retry a message that failed to send (subtask 13). */
  retry(messageId: string): void {
    const message = this._findMessage(messageId);
    if (!message) {
      return;
    }
    this.updateStatus(messageId, 'sending');
    this._sendError.set('');
    if (message.attachment) {
      this._uploads.update((u) =>
        u[message.id] ? { ...u, [message.id]: { progress: 0, status: 'uploading', error: null } } : u
      );
      // Re-upload from the (possibly temp) attachment url is not possible without
      // the original file; signal the page so it can re-select. For text-only
      // retries, push through the socket directly.
      if (!message.text) {
        this._sendError.set('Re-select the attachment to retry sending.');
        this.updateStatus(messageId, 'failed');
        return;
      }
    }
    const delivered = this.ws.send({
      type: 'chat.send',
      payload: { conversationId: message.conversationId, text: message.text, clientMessageId: message.id },
    });
    this.updateStatus(messageId, delivered ? 'sent' : 'failed');
    if (!delivered) {
      this._sendError.set('Not connected — message will not reach the caregiver yet.');
    }
  }

  /** Cancel an in-flight upload (subtask 3). */
  cancelUpload(messageId: string): void {
    const sub = this._uploadSubs.get(messageId);
    if (sub) {
      sub.unsubscribe();
      this._uploadSubs.delete(messageId);
    }
    this._uploads.update((u) => {
      const cur = u[messageId];
      if (!cur) {
        return u;
      }
      return { ...u, [messageId]: { progress: cur.progress, status: 'error', error: 'Upload cancelled.' } };
    });
    this.updateStatus(messageId, 'failed');
  }

  /** Report a user to moderation (subtask 11). */
  reportUser(userId: string, reason = ''): void {
    this.ws.send({ type: 'report.create', payload: { targetUserId: userId, reason } });
  }

  /** Block a user (subtask 11). */
  blockUser(userId: string): void {
    this._blockedIds.update((set) => new Set(set).add(userId));
    this.ws.send({ type: 'chat.block', payload: { blockedUserId: userId } });
  }

  unblockUser(userId: string): void {
    this._blockedIds.update((set) => {
      const next = new Set(set);
      next.delete(userId);
      return next;
    });
    this.ws.send({ type: 'chat.unblock', payload: { blockedUserId: userId } });
  }

  /** Client-side conversation search (subtask 10). */
  readonly searchInConversation = (query: string): string[] => {
    const id = this._activeId();
    if (!id) {
      return [];
    }
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [];
    }
    const me = this.session.session()?.userId ?? '';
    return (this._messages()[id] ?? [])
      .filter((m) => m.authorId !== me && m.text.toLowerCase().includes(needle))
      .map((m) => m.id);
  };

  /** Handles envelopes from the chat WebSocket. */
  handleEnvelope(envelope: WsEnvelope): void {
    switch (envelope.type) {
      case 'chat.message': {
        const payload = envelope.payload as {
          conversationId: string;
          authorId: string;
          text: string;
          sentAtMs: number;
          attachment?: Attachment;
          bookingId?: string | null;
          reactions?: ReactionCounts;
          deliveredAtMs?: number;
          readAtMs?: number;
        };
        const me = this.session.session();
        const isMine = me !== null && payload.authorId === me?.userId;
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          conversationId: payload.conversationId,
          authorId: payload.authorId,
          text: payload.text ?? '',
          sentAtMs: payload.sentAtMs,
          status: 'sent',
          attachment: payload.attachment,
          reactions: payload.reactions ?? {},
          bookingId: payload.bookingId ?? null,
          deliveredAtMs: payload.deliveredAtMs ?? null,
          readAtMs: payload.readAtMs ?? null,
        };
        this.appendMessage(message);
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
      case 'chat.delivered': {
        // Server: these messages reached the peer (subtask 8).
        const payload = envelope.payload as { messageIds?: string[]; deliveredAtMs?: number };
        const at = payload.deliveredAtMs ?? Date.now();
        this._stampReceipts(payload.messageIds, 'deliveredAtMs', at);
        break;
      }
      case 'chat.read': {
        // Peer read our messages (subtask 8).
        const payload = envelope.payload as { conversationId: string; messageIds?: string[]; readAtMs?: number };
        const at = payload.readAtMs ?? Date.now();
        const convo = payload.conversationId;
        const me = this.session.session()?.userId ?? '';
        const ids =
          payload.messageIds ??
          (this._messages()[convo] ?? [])
            .filter((m) => m.authorId === me)
            .map((m) => m.id);
        this._stampReceipts(ids, 'readAtMs', at);
        break;
      }
      case 'chat.typing': {
        const payload = envelope.payload as { conversationId: string; userId: string; typing: boolean };
        if (!payload?.conversationId || !payload?.userId) {
          return;
        }
        this._conversations.update((list) =>
          list.map((c) => {
            if (c.id !== payload.conversationId) {
              return c;
            }
            const typingIds = c.typingIds.includes(payload.userId)
              ? c.typingIds.filter((u) => u !== payload.userId)
              : [...c.typingIds, payload.userId];
            return { ...c, typingIds };
          })
        );
        if (payload.typing) {
          this._typingTimers.set(
            payload.userId,
            setTimeout(() => this._removeTyping(payload.conversationId, payload.userId), 5_000)
          );
        } else {
          const existing = this._typingTimers.get(payload.userId);
          if (existing) {
            clearTimeout(existing);
            this._typingTimers.delete(payload.userId);
          }
        }
        break;
      }
      case 'chat.reaction': {
        const payload = envelope.payload as { messageId: string; emoji: string };
        if (payload?.messageId && payload?.emoji) {
          this._addReaction(payload.messageId, payload.emoji);
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

  private _stampReceipts(
    messageIds: string[] | undefined,
    field: 'deliveredAtMs' | 'readAtMs',
    at: number
  ): void {
    if (!messageIds?.length) {
      return;
    }
    this._messages.update((all) => {
      const next: Record<string, ChatMessage[]> = {};
      for (const [id, list] of Object.entries(all)) {
        next[id] = list.map((m) => (messageIds.includes(m.id) && m[field] == null ? { ...m, [field]: at } : m));
      }
      return next;
    });
    this._persist();
  }

  private _addReaction(messageId: string, emoji: string): void {
    this._messages.update((all) => {
      const next: Record<string, ChatMessage[]> = {};
      for (const [id, list] of Object.entries(all)) {
        next[id] = list.map((m) => {
          if (m.id !== messageId || m.reactions == null) {
            return m;
          }
          return { ...m, reactions: { ...m.reactions, [emoji]: (m.reactions[emoji] ?? 0) + 1 } };
        });
      }
      return next;
    });
    this._persist();
  }

  private _removeTyping(conversationId: string, userId: string): void {
    this._conversations.update((list) =>
      list.map((c) => (c.id === conversationId ? { ...c, typingIds: c.typingIds.filter((u) => u !== userId) } : c))
    );
  }

  private _deliverMessage(message: ChatMessage, conversationId: string): void {
    const me = this.session.session();
    if (!me) {
      return;
    }
    const delivered = this.ws.send({
      type: 'chat.send',
      payload: {
        conversationId,
        text: message.text,
        clientMessageId: message.id,
        attachment: message.attachment,
        bookingId: message.bookingId ?? null,
      },
    });
    this.updateStatus(message.id, delivered ? 'sent' : 'failed');
    if (!delivered) {
      this._sendError.set('Not connected — message will not reach the caregiver yet.');
    }
  }

  private _failUpload(messageId: string, conversationId: string, error: string): void {
    this.updateStatus(messageId, 'failed');
    this._uploads.update((u) =>
      u[messageId] ? { ...u, [messageId]: { progress: 100, status: 'error', error } } : u
    );
    this._sendError.set(error);
  }

  private _findMessage(messageId: string): ChatMessage | undefined {
    for (const list of Object.values(this._messages())) {
      const found = list.find((m) => m.id === messageId);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private _replaceAttachment(messageId: string, attachment: Attachment): void {
    this._messages.update((all) => {
      const next: Record<string, ChatMessage[]> = {};
      for (const [id, list] of Object.entries(all)) {
        next[id] = list.map((m) => (m.id === messageId ? { ...m, attachment } : m));
      }
      return next;
    });
    this._persist();
  }

  private _previewUrl(file: File): string {
    try {
      return URL.createObjectURL(file);
    } catch {
      return file.name;
    }
  }

  private _touchConversation(id: string, sentAtMs: number): void {
    this._conversations.update((list) => {
      const existing = list.find((c) => c.id === id);
      const updated = existing
        ? list.map((c) => (c.id === id ? { ...c, lastMessageAtMs: sentAtMs } : c))
        : [{ id, displayName: id, lastMessageAtMs: sentAtMs, unread: 0, typingIds: [] }, ...list];
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
          parsed.conversations.map((c) => ({ ...c, typingIds: c.typingIds ?? [] }))
        );
      }
      if (parsed.messages && typeof parsed.messages === 'object') {
        this._messages.set(
          Object.fromEntries(
            Object.entries(parsed.messages).filter(([, list]) => Array.isArray(list))
          )
        );
      }
    } catch {
      // Corrupted storage — start clean.
    }
  }
}

/** Expose typed upload events for the page's progress view (subtask 3). */
export type ChatUploadState = { progress: number; status: 'uploading' | 'done' | 'error'; error: string | null };
