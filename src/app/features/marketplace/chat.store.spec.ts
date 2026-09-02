import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Subject } from 'rxjs';
import { ChatStore, ChatMessage } from './chat.store';
import { SessionStore } from '../../core/auth/session';
import { WebSocketClient, WsEnvelope } from '../../core/services/ws/websocket.client';
import { ROLES } from '../../core/auth/roles';

function makeSession() {
  return {
    userId: 'me',
    displayName: 'Me',
    roles: [ROLES.CLIENT],
    expiresAtMs: Date.now() + 60 * 60 * 1000,
  };
}

function makeStore() {
  const session = new SessionStore();
  session.setSession(makeSession());
  const messages$ = new Subject<WsEnvelope>();
  const connected$ = new Subject<boolean>();
  const ws = {
    messages$,
    connected$,
    connect: vi.fn(),
    send: vi.fn(() => true),
    close: vi.fn(),
  } as unknown as WebSocketClient;
  return { store: new ChatStore(session, ws), ws, session };
}

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

describe('ChatStore', () => {
  beforeEach(() => {
    localStorage.clear();
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
    expect(store.activeId()).toBe('peer-1');
  });

  it('appends messages and sorts conversations by recency', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.appendMessage({
      id: 'm1',
      conversationId: 'peer-1',
      authorId: 'peer-1',
      text: 'first',
      sentAtMs: 1000,
      status: 'sent',
    });
    store.openConversation('peer-2', 'Nikos');
    store.appendMessage({
      id: 'm2',
      conversationId: 'peer-2',
      authorId: 'peer-2',
      text: 'second',
      sentAtMs: 2000,
      status: 'sent',
    });
    expect(store.conversations().map((c) => c.id)).toEqual(['peer-2', 'peer-1']);
    expect(store.activeMessages().map((m) => m.id)).toEqual(['m2']);
  });

  it('bumps unread for incoming messages in inactive conversations', () => {
    const { store } = makeStore();
    store.openConversation('peer-2', 'Nikos'); // active conversation
    store.handleEnvelope(incomingMessage()); // message lands in peer-1
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
    expect(ws.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'chat.send' })
    );
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
    store.appendMessage({
      id: 'm1',
      conversationId: 'peer-1',
      authorId: 'peer-1',
      text: 'hi',
      sentAtMs: 1000,
      status: 'sent',
    });
    const raw = localStorage.getItem('cm.chat.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { conversations: unknown[]; messages: Record<string, unknown[]> };
    expect(parsed.conversations).toHaveLength(1);
    expect(parsed.messages['peer-1']).toHaveLength(1);
  });

  it('rehydrates persisted state on construction', () => {
    const { store } = makeStore();
    store.openConversation('peer-1', 'Elena');
    store.appendMessage({
      id: 'm1',
      conversationId: 'peer-1',
      authorId: 'peer-1',
      text: 'hi',
      sentAtMs: 1000,
      status: 'sent',
    });

    const { store: fresh } = makeStore();
    expect(fresh.conversations()).toHaveLength(1);
    expect(fresh.messages()['peer-1']).toHaveLength(1);
  });

  it('ignores corrupted persisted state', () => {
    localStorage.setItem('cm.chat.v1', '{not-json');
    const { store } = makeStore();
    expect(store.conversations()).toEqual([]);
  });
});
