import { IncomingMessage, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { query } from './db';
import { socketStore } from './app';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-change-me';

interface AuthedSocket extends WebSocket {
  isAlive?: boolean;
  userId?: string;
  channel?: 'chat' | 'visits';
}

/**
 * WebSocket endpoints (PLAN.md §1 Real-time): the SPA connects to
 * `/api/ws/chat` and `/api/ws/visits`. Auth comes from the same httpOnly
 * session cookie the REST API uses (sent automatically on same-origin
 * handshakes).
 *
 * Protocol (matches the clients):
 *   chat.send         client -> server  { conversationId, text, clientMessageId }
 *   chat.ack          server -> sender  { clientMessageId }
 *   chat.message      server -> peer    { conversationId, authorId, text, sentAtMs }
 *   visit.position    client -> server  { visitId, position }   (broadcast)
 *   visit.status      server -> client  { visitId, status }     (REST-triggered)
 */

/** userId -> sockets currently connected to the chat channel. */
const chatByUser = new Map<string, Set<AuthedSocket>>();
/** Sockets connected to the visits channel (family live tracking). */
const visitSockets = new Set<AuthedSocket>();

export function attachWebSockets(server: Server): void {
  const chatWs = new WebSocketServer({ noServer: true });
  const visitsWs = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }

    // Resolve and authenticate before upgrading.
    const userId = userIdFromRequest(request);
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (pathname === '/api/ws/chat') {
      chatWs.handleUpgrade(request, socket, head, (ws) => {
        const authed = ws as AuthedSocket;
        authed.userId = userId;
        authed.channel = 'chat';
        chatWs.emit('connection', authed, request);
      });
      return;
    }
    if (pathname === '/api/ws/visits') {
      visitsWs.handleUpgrade(request, socket, head, (ws) => {
        const authed = ws as AuthedSocket;
        authed.userId = userId;
        authed.channel = 'visits';
        visitsWs.emit('connection', authed, request);
      });
      return;
    }
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  });

  chatWs.on('connection', (socket: AuthedSocket) => {
    socketStore().join('chat', socket);
    if (socket.userId) {
      const peers = chatByUser.get(socket.userId) ?? new Set<AuthedSocket>();
      peers.add(socket);
      chatByUser.set(socket.userId, peers);
    }
    markAlive(socket);

    socket.on('message', (data) => void handleChatMessage(socket, String(data)));
    socket.on('close', () => {
      socketStore().leave('chat', socket);
      if (socket.userId) {
        const peers = chatByUser.get(socket.userId);
        peers?.delete(socket);
        if (peers?.size === 0) {
          chatByUser.delete(socket.userId);
        }
      }
      chatWs.clients.delete(socket);
    });
  });

  visitsWs.on('connection', (socket: AuthedSocket) => {
    socketStore().join('visits', socket);
    visitSockets.add(socket);
    markAlive(socket);

    socket.on('message', (data) => {
      try {
        const envelope = JSON.parse(String(data)) as { type?: string; payload?: unknown };
        if (envelope.type === 'visit.position') {
          // Relay live positions to every connected listener (family view).
          socketStore().broadcast('visits', envelope);
        }
      } catch {
        // Ignore malformed frames.
      }
    });
    socket.on('close', () => {
      socketStore().leave('visits', socket);
      visitSockets.delete(socket);
    });
  });

  // Heartbeat: drop dead connections so the closed-set never leaks.
  const timer = setInterval(() => {
    for (const socket of [...chatByUser.values()].flatMap((s) => [...s])) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
    for (const socket of visitSockets) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);

  server.on('close', () => clearInterval(timer));
}

function markAlive(socket: AuthedSocket): void {
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });
}

function userIdFromRequest(request: IncomingMessage): string | null {
  const cookieHeader = request.headers.cookie ?? '';
  const accessToken = cookieValue(cookieHeader, 'cm_access');
  if (!accessToken) {
    return null;
  }
  try {
    const payload = jwt.verify(accessToken, JWT_SECRET) as { userId?: string };
    return payload.userId ?? null;
  } catch {
    return null;
  }
}

function cookieValue(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return rest.join('=');
    }
  }
  return null;
}

async function handleChatMessage(socket: AuthedSocket, raw: string): Promise<void> {
  let envelope: { type?: string; payload?: Record<string, unknown> };
  try {
    envelope = JSON.parse(raw);
  } catch {
    return;
  }
  if (envelope.type !== 'chat.send' || !socket.userId) {
    return;
  }
  const payload = envelope.payload ?? {};
  const conversationId = String(payload.conversationId ?? '');
  const text = String(payload.text ?? '');
  const clientMessageId = String(payload.clientMessageId ?? '');
  if (!conversationId || !text.trim()) {
    return;
  }

  // Persist so history survives reloads (Phase 1 exit criterion).
  const sentAtMs = Date.now();
  try {
    await query(
      `INSERT INTO chat_messages (id, conversation_id, author_id, text, sent_at_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [`m-${randomBytes(6).toString('hex')}`, conversationId, socket.userId, text.trim(), sentAtMs]
    );
  } catch (error) {
    console.error('[ws:chat] failed to persist message', error);
  }

  // Ack the sender's message id so the UI flips sending → sent.
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'chat.ack', payload: { clientMessageId } }));
  }

  // Deliver to the peer (the client keys conversations by the peer's user id).
  const delivery = JSON.stringify({
    type: 'chat.message',
    payload: {
      conversationId,
      authorId: socket.userId,
      text: text.trim(),
      sentAtMs,
    },
  });
  for (const peer of chatByUser.get(conversationId) ?? []) {
    if (peer.readyState === WebSocket.OPEN) {
      peer.send(delivery);
    }
  }
}