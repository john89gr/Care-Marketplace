import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Subject, of, type Observable } from 'rxjs';
import {
  ChatStore,
  type ChatMessage,
  MAX_ATTACHMENT_BYTES,
  validateAttachment,
  attachmentKindFor,
  aggregateReactions,
  resolveBookingContext,
  type AttachmentKind,
  type BookingContextCard,
} from './chat.store';
import { SessionStore } from '../../core/auth/session';
import { WebSocketClient, type WsEnvelope } from '../../core/services/ws/websocket.client';
import { ROLES } from '../../core/auth/roles';
import { HttpClient, HttpEventType, HttpResponse, type HttpEvent, type HttpUploadProgressEvent } from '@angular/common/http';

function makeSession() {
  return {
    userId: 'me',
    displayName: 'Me',
    roles: [ROLES.CLIENT],
    expiresAtMs: Date.now() + 60 * 60 * 1000,
  };
}

type HttpStub = { request: (method: string, url: string, options: unknown) => Observable<unknown> };

function makeHttp(requestImpl: HttpStub['request'] = vi.fn(() => of())) {
  return { request: requestImpl } as unknown as HttpClient;
}

function makeStore(http: HttpClient = makeHttp()) {
  const session = new SessionStore();
  session.setSession(makeSession());
  const messages$ = new Subject<WsEnvelope>();
  const connected$ = new Subject<boolean>();
  const ws = {
    messages$,
    connected$,
    typing$: new Subject(),
    connect: vi.fn(),
    send: vi.fn(() => true),
    close: vi.fn(),
  } as unknown as WebSocketClient;
  return { store: new ChatStore(session, ws, http), ws, session, http };
}

// File-wide: every test starts from a clean localStorage so a fresh store never
// rehydrates messages persisted by an earlier test.
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

function incomingMessage(overrides: Partial<ChatMessage> = {}): WsEnvelope {
  return {
    type: 'chat.message',
    payload: {
      conversationId: 'peer-1',
      authorId: 'peer-1',
      text: 'Hello!',
      sentAtMs: Date.now(),
      ...overrides,
    },
  };
}

function baseMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    conversationId: 'peer-1',
    authorId: 'me',
    text: 'hi',
    sentAtMs: 1000,
    status: 'sent',
    reactions: {},
    ...overrides,
  };
}

function progressEvent(loaded: number, total: number): HttpUploadProgressEvent {
  return { type: HttpEventType.UploadProgress, loaded, total } as HttpUploadProgressEvent;
}

function uploadResponse(
  url = 'blob:fake',
  name = 'test.png',
  sizeMs = 100,
  kind: AttachmentKind = 'image'
): HttpResponse<unknown> {
  return new HttpResponse({ status: 200, body: { url, name, sizeMs, kind } });
}

describe('ChatStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('starts empty with no unread messages', () => {
    const { store } = makeStore();
    expect(store.conversations()).toEqual([]);
    expect(store.totalUnread()).toBe(0);
  });

  it('creates a conversation when opened', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    expect(store.conversations()).toHaveLength(1);
    expect(store.conversations()[0].displayName).toBe('Elena');
    expect(store.conversations()[0].typingIds).toEqual([]);
    expect(store.activeId()).toBe('peer-1');
  });

  it('appends messages and sorts conversations by recency', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.appendMessage(baseMsg({ id: 'm1', conversationId: 'peer-1', authorId: 'peer-1', sentAtMs: 1000 }));
    store.openConversation('peer-2', 'Nikos');
    store.appendMessage(baseMsg({ id: 'm2', conversationId: 'peer-2', authorId: 'peer-2', sentAtMs: 2000 }));
    expect(store.conversations().map((c) => c.id)).toEqual(['peer-2', 'peer-1']);
    expect(store.activeMessages().map((m) => m.id)).toEqual(['m2']);
  });

  it('bumps unread for incoming messages in inactive conversations', () => {
    const { store } = makeStore();
    store.openConversation('peer-2', 'Nikos');
    store.handleEnvelope(incomingMessage());
    expect(store.totalUnread()).toBe(1);
    expect(store.conversations().find((c) => c.id === 'peer-1')?.unread).toBe(1);
  });

  it('does not bump unread for the active conversation', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.handleEnvelope(incomingMessage({ sentAtMs: Date.now() + 1 }));
    store.markRead('peer-1');
    store.handleEnvelope(incomingMessage({ sentAtMs: Date.now() + 2 }));
    expect(store.totalUnread()).toBe(0);
  });

  it('marks a conversation read when opened', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.handleEnvelope(incomingMessage());
    store.openConversation('peer-1');
    expect(store.conversations()[0].unread).toBe(0);
  });

  it('sends messages through the socket and tracks delivery status', () => {
    const { store, ws } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.send('hello');
    expect(ws.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'chat.send' }));
    expect(store.activeMessages()[0].status).toBe('sent');
  });

  it('marks messages as failed when the socket is not connected', () => {
    const { store, ws } = makeStore();
    ws.send = vi.fn(() => false);
    store.openConversation('peer-1', 'Elena');
    store.send('hello');
    expect(store.activeMessages()[0].status).toBe('failed');
    expect(store.sendError()).toContain('Not connected');
  });

  it('persists conversations and messages to localStorage', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.appendMessage(baseMsg({ id: 'm1' }));
    const raw = localStorage.getItem('cm.chat.v2');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { conversations: unknown[]; messages: Record<string, unknown[]> };
    expect(parsed.conversations).toHaveLength(1);
    expect(parsed.messages['peer-1']).toHaveLength(1);
  });

  it('rehydrates persisted state on construction', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.appendMessage(baseMsg({ id: 'm1' }));

    const { store: fresh } = makeStore();
    expect(fresh.conversations()).toHaveLength(1);
    expect(fresh.messages()['peer-1']).toHaveLength(1);
  });

  it('ignores corrupted persisted state', () => {
    localStorage.setItem('cm.chat.v2', '{not-json');
    const { store } = makeStore();
    expect(store.conversations()).toEqual([]);
  });

  it('backfills missing typingIds on rehydrate', () => {
    localStorage.setItem('cm.chat.v2', JSON.stringify({ conversations: [{ id: 'p', displayName: 'P', lastMessageAtMs: 0, unread: 0 }], messages: {} }));
    const { store } = makeStore();
    expect(store.conversations()[0].typingIds).toEqual([]);
  });
});

describe('validateAttachment', () => {
  it('accepts allowed image types', () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png', lastModified: 0 });
    expect(validateAttachment(file).valid).toBe(true);
    expect(validateAttachment(file).kind).toBe('image');
  });

  it('accepts PDF and voice webm', () => {
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf', lastModified: 0 });
    expect(validateAttachment(pdf).kind).toBe('pdf');
    const voice = new File(['x'], 'note.webm', { type: 'audio/webm', lastModified: 0 });
    expect(validateAttachment(voice).kind).toBe('voice');
  });

  it('rejects unsupported types', () => {
    const file = new File(['x'], 'movie.mp4', { type: 'video/mp4', lastModified: 0 });
    const result = validateAttachment(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unsupported');
    expect(result.kind).toBeNull();
  });

  it('rejects files over the 10 MB limit', () => {
    const file = new File(['x'], 'big.png', { type: 'image/png', lastModified: 0 });
    Object.defineProperty(file, 'size', { value: MAX_ATTACHMENT_BYTES + 1 });
    const result = validateAttachment(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('10 MB');
  });

  it('attachmentKindFor returns null for unknown types', () => {
    expect(attachmentKindFor('text/plain')).toBeNull();
    expect(attachmentKindFor('image/webp')).toBe('image');
  });
});

describe('ChatStore attachments & uploads', () => {
  it('sendAttachment creates an optimistic message and uploads', () => {
    const events$ = new Subject<HttpEvent<unknown>>();
    const { store, ws, http } = makeStore(makeHttp(vi.fn(() => events$)));
    store.openConversation('peer-1', 'Elena');
    const file = new File(['x'], 'photo.png', { type: 'image/png', lastModified: 0 });

    store.sendAttachment(file);

    expect(store.activeMessages()).toHaveLength(1);
    const msg = store.activeMessages()[0];
    expect(msg.status).toBe('sending');
    expect(msg.attachment?.kind).toBe('image');

    const call = http.request as ReturnType<typeof vi.fn>;
    expect(call).toHaveBeenCalledWith('POST', '/api/uploads', expect.objectContaining({ body: expect.any(FormData) }));

    events$.next(uploadResponse('blob:fake', 'photo.png', 42, 'image'));
    events$.complete();

    const updated = store.activeMessages()[0];
    expect(updated.attachment?.url).toBe('blob:fake');
    expect(updated.status).toBe('sent');
    expect(store.uploads()[updated.id].status).toBe('done');
    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chat.send', payload: expect.objectContaining({ attachment: expect.any(Object) }) })
    );
  });

  it('emits progress updates during upload', () => {
    const events$ = new Subject<HttpEvent<unknown>>();
    const { store } = makeStore(makeHttp(vi.fn(() => events$)));
    store.openConversation('peer-1', 'Elena');
    const file = new File(['x'], 'photo.png', { type: 'image/png', lastModified: 0 });
    Object.defineProperty(file, 'size', { value: 200 });

    store.sendAttachment(file);
    const msgId = store.activeMessages()[0].id;
    events$.next(progressEvent(100, 200));

    expect(store.uploads()[msgId].progress).toBe(50);
    events$.next(uploadResponse());
    events$.complete();
  });

  it('rejects an invalid attachment without uploading', () => {
    const { store, http, ws } = makeStore();
    store.openConversation('peer-1', 'Elena');
    const file = new File(['x'], 'movie.mp4', { type: 'video/mp4', lastModified: 0 });

    store.sendAttachment(file);
    expect(http.request).not.toHaveBeenCalled();
    expect(store.sendError()).toContain('Unsupported');
    expect(store.activeMessages()).toHaveLength(0);
  });

  it('marks the message failed when the upload errors', () => {
    const events$ = new Subject<HttpEvent<unknown>>();
    const { store } = makeStore(makeHttp(vi.fn(() => events$)));
    store.openConversation('peer-1', 'Elena');
    const file = new File(['x'], 'photo.png', { type: 'image/png', lastModified: 0 });

    store.sendAttachment(file);
    const msgId = store.activeMessages()[0].id;
    events$.error(new Error('boom'));

    expect(store.activeMessages()[0].status).toBe('failed');
    expect(store.uploads()[msgId].status).toBe('error');
    expect(store.sendError()).toContain('Upload failed');
  });

  it('cancelUpload unsubscribes and marks the message failed', () => {
    const events$ = new Subject<HttpEvent<unknown>>();
    const { store } = makeStore(makeHttp(vi.fn(() => events$)));
    store.openConversation('peer-1', 'Elena');
    const file = new File(['x'], 'a.png', { type: 'image/png', lastModified: 0 });

    store.sendAttachment(file);
    const msgId = store.activeMessages()[0].id;
    store.cancelUpload(msgId);

    expect(store.activeMessages()[0].status).toBe('failed');
    expect(store.uploads()[msgId].status).toBe('error');
    expect(store.uploads()[msgId].error).toContain('cancelled');
  });

  it('sendAttachment with no open conversation sets an error', () => {
    const { store, http } = makeStore();
    const file = new File(['x'], 'a.png', { type: 'image/png', lastModified: 0 });
    store.sendAttachment(file);
    expect(http.request).not.toHaveBeenCalled();
    expect(store.sendError()).toBeTruthy();
  });
});

describe('ChatStore reactions', () => {
  it('react increments the local reaction count and sends a WS event', () => {
    const { store, ws } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.appendMessage(baseMsg({ id: 'm1', authorId: 'peer-1' }));
    store.react('m1', '👍');
    expect(store.messages()['peer-1'][0].reactions).toEqual({ '👍': 1 });
    expect(ws.send).toHaveBeenCalledWith({ type: 'chat.reaction', payload: { messageId: 'm1', emoji: '👍' } });
  });

  it('handles an incoming chat.reaction by aggregating', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.appendMessage(baseMsg({ id: 'm1', authorId: 'peer-1' }));
    store.handleEnvelope({ type: 'chat.reaction', payload: { messageId: 'm1', emoji: '❤️' } });
    store.handleEnvelope({ type: 'chat.reaction', payload: { messageId: 'm1', emoji: '❤️' } });
    expect(store.messages()['peer-1'][0].reactions).toEqual({ '❤️': 2 });
  });

  it('aggregateReactions sums counts across a conversation', () => {
    const msgs = [
      baseMsg({ id: 'm1', reactions: { '👍': 2, '❤️': 1 } }),
      baseMsg({ id: 'm2', reactions: { '👍': 3 } }),
      baseMsg({ id: 'm3', reactions: {} }),
    ];
    expect(aggregateReactions(msgs)).toEqual({ '👍': 5, '❤️': 1 });
  });
});

describe('ChatStore read receipts', () => {
  it('markRead stamps readAtMs on the peer messages and sends chat.read', () => {
    const { store, ws } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.appendMessage(baseMsg({ id: 'm1', authorId: 'peer-1', readAtMs: null }));
    store.markRead('peer-1');
    expect(store.messages()['peer-1'][0].readAtMs).not.toBeNull();
    expect(ws.send).toHaveBeenCalledWith({ type: 'chat.read', payload: { conversationId: 'peer-1', readAtMs: expect.any(Number) } });
  });

  it('handles chat.read to stamp sent messages as read by the peer', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.appendMessage(baseMsg({ id: 'm1', authorId: 'me', readAtMs: null }));
    store.handleEnvelope({ type: 'chat.read', payload: { conversationId: 'peer-1', readAtMs: 9999 } });
    expect(store.messages()['peer-1'][0].readAtMs).toBe(9999);
  });

  it('handles chat.delivered to stamp deliveredAtMs on sent messages', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.appendMessage(baseMsg({ id: 'm1', authorId: 'me', deliveredAtMs: null }));
    store.handleEnvelope({ type: 'chat.delivered', payload: { messageIds: ['m1'], deliveredAtMs: 555 } });
    expect(store.messages()['peer-1'][0].deliveredAtMs).toBe(555);
  });
});

describe('ChatStore typing indicators', () => {
  it('startTyping/stopTyping send ws events', () => {
    const { store, ws } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.startTyping();
    expect(ws.send).toHaveBeenCalledWith({ type: 'chat.typing', payload: { conversationId: 'peer-1', typing: true } });
    store.stopTyping();
    expect(ws.send).toHaveBeenCalledWith({ type: 'chat.typing', payload: { conversationId: 'peer-1', typing: false } });
  });

  it('handles chat.typing to track peer typing state', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.handleEnvelope({ type: 'chat.typing', payload: { conversationId: 'peer-1', userId: 'peer-1', typing: true } });
    expect(store.conversations().find((c) => c.id === 'peer-1')?.typingIds).toEqual(['peer-1']);
    expect(store.typingInActive()).toEqual(['peer-1']);

    store.handleEnvelope({ type: 'chat.typing', payload: { conversationId: 'peer-1', userId: 'peer-1', typing: false } });
    expect(store.conversations().find((c) => c.id === 'peer-1')?.typingIds).toEqual([]);
  });

  it('excludes the current user from typing display', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.handleEnvelope({ type: 'chat.typing', payload: { conversationId: 'peer-1', userId: 'me', typing: true } });
    expect(store.typingInActive()).toEqual([]);
  });

  it('opening a conversation clears typing', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.handleEnvelope({ type: 'chat.typing', payload: { conversationId: 'peer-1', userId: 'peer-1', typing: true } });
    store.openConversation('peer-1');
    expect(store.conversations()[0].typingIds).toEqual([]);
  });
});

describe('ChatStore booking context', () => {
  it('sendBookingContext sends a message tagged with bookingId', () => {
    const { store, ws } = makeStore();
    store.openConversation('peer-1', 'Elena');
    const booking: BookingContextCard = {
      id: 'b-1', status: 'accepted', caregiverName: 'Elena Papadaki', clientName: 'Me', scheduledAtMs: 1000, note: 'Injection',
    };
    store.sendBookingContext('b-1', booking);
    const msg = store.activeMessages()[0];
    expect(msg.bookingId).toBe('b-1');
    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chat.send', payload: expect.objectContaining({ bookingId: 'b-1' }) })
    );
  });

  it('resolveBookingContext resolves a card from the message payload', () => {
    const bookings: BookingContextCard[] = [
      { id: 'b-1', status: 'accepted', caregiverName: 'Elena', clientName: 'Me', scheduledAtMs: 1000, note: 'Injection' },
    ];
    const msg = baseMsg({ bookingId: 'b-1' });
    expect(resolveBookingContext(msg, bookings)?.id).toBe('b-1');
  });

  it('resolveBookingContext returns null when no bookingId or no match', () => {
    const bookings: BookingContextCard[] = [{ id: 'b-1', status: 'accepted', caregiverName: 'E', clientName: 'Me', scheduledAtMs: 1, note: '' }];
    expect(resolveBookingContext(baseMsg({ bookingId: null }), bookings)).toBeNull();
    expect(resolveBookingContext(baseMsg({ bookingId: 'b-9' }), bookings)).toBeNull();
  });

  it('incoming messages carry bookingId attachment context', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.handleEnvelope({
      type: 'chat.message',
      payload: { conversationId: 'peer-1', authorId: 'peer-1', text: '', sentAtMs: Date.now(), bookingId: 'b-1', reactions: { '👍': 1 } },
    });
    const msg = store.messages()['peer-1'][0];
    expect(msg.bookingId).toBe('b-1');
    expect(msg.reactions).toEqual({ '👍': 1 });
  });
});

describe('ChatStore search & moderation', () => {
  it('searchInConversation finds peer messages containing the query', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.appendMessage(baseMsg({ id: 'm1', authorId: 'peer-1', text: 'Hello there' }));
    store.appendMessage(baseMsg({ id: 'm2', authorId: 'peer-1', text: 'Bye' }));
    expect(store.searchInConversation('hello').map((id) => id)).toEqual(['m1']);
  });

  it('searchInConversation ignores own messages', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.appendMessage(baseMsg({ id: 'm1', authorId: 'me', text: 'hello me' }));
    store.appendMessage(baseMsg({ id: 'm2', authorId: 'peer-1', text: 'hello peer' }));
    expect(store.searchInConversation('hello')).toEqual(['m2']);
  });

  it('reportUser sends a report.create event', () => {
    const { store, ws } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.reportUser('peer-1', 'spam');
    expect(ws.send).toHaveBeenCalledWith({ type: 'report.create', payload: { targetUserId: 'peer-1', reason: 'spam' } });
  });

  it('blockUser adds the id to the blocked set and signals the socket', () => {
    const { store, ws } = makeStore();
    store.blockUser('peer-1');
    expect(store.blockedIds()).toContain('peer-1');
    expect(ws.send).toHaveBeenCalledWith({ type: 'chat.block', payload: { blockedUserId: 'peer-1' } });
  });

  it('unblockUser removes the id', () => {
    const { store } = makeStore();
    store.blockUser('peer-1');
    store.unblockUser('peer-1');
    expect(store.blockedIds()).not.toContain('peer-1');
  });
});

describe('ChatStore send retry', () => {
  it('retry re-sends a failed text message and flips status', () => {
    const { store, ws } = makeStore();
    ws.send = vi.fn(() => true);
    store.openConversation('peer-1', 'Elena');
    // Send while disconnected -> failed.
    ws.send = vi.fn(() => false);
    store.send('hello');
    expect(store.activeMessages()[0].status).toBe('failed');
    // Reconnect and retry.
    ws.send = vi.fn(() => true);
    const msgId = store.activeMessages()[0].id;
    store.retry(msgId);
    expect(store.activeMessages()[0].status).toBe('sent');
    expect(ws.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'chat.send' }));
  });
});
