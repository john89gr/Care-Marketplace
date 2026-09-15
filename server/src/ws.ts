import { IncomingMessage, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { query, queryOne, Row } from './db';
import { socketStore } from './app';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-change-me';

export interface AuthedSocket extends WebSocket {
  isAlive?: boolean;
  userId?: string;
  channel?: 'chat' | 'visits';
}

/** userId -> sockets currently connected to the chat channel. */
const chatByUser = new Map<string, Set<AuthedSocket>>();
/** Sockets connected to the visits channel (family live tracking). */
const visitSockets = new Set<AuthedSocket>();

export function getChatSocketsForUser(userId: string): Set<AuthedSocket> | undefined {
  return chatByUser.get(userId);
}

export function sendToUser(userId: string, envelope: unknown): void {
  const sockets = chatByUser.get(userId);
  if (sockets) {
    const payload = JSON.stringify(envelope);
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }
}

export async function deliverToPeer(
  senderUserId: string | undefined,
  conversationId: string,
  rawMessage: string,
  includeSender = false
): Promise<void> {
  const targetUserIds = new Set<string>();

  // 1. Direct peer if conversationId is a userId
  if (conversationId && conversationId !== senderUserId) {
    targetUserIds.add(conversationId);
  }

  // 2. If conversationId is a composite "u1:u2"
  if (conversationId.includes(':')) {
    for (const part of conversationId.split(':')) {
      if (part && part !== senderUserId) {
        targetUserIds.add(part);
      }
    }
  }

  // 3. Query chat_messages for other authors in this conversation
  try {
    const others = await query<{ author_id: string }>(
      `SELECT DISTINCT author_id FROM chat_messages WHERE conversation_id = $1 AND author_id != $2`,
      [conversationId, senderUserId ?? '']
    );
    for (const r of others) {
      if (r.author_id && r.author_id !== senderUserId) {
        targetUserIds.add(r.author_id);
      }
    }
  } catch {
    // ignore DB lookup errors
  }

  if (includeSender && senderUserId) {
    targetUserIds.add(senderUserId);
  }

  for (const uid of targetUserIds) {
    const sockets = chatByUser.get(uid);
    if (sockets) {
      for (const socket of sockets) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(rawMessage);
        }
      }
    }
  }
}

export async function applyReaction(
  messageId: string,
  emoji: string,
  action: 'add' | 'remove' = 'add'
): Promise<{ reactions: Record<string, number>; conversationId: string } | null> {
  const row = await queryOne<{ reactions: unknown; conversation_id: string }>(
    `SELECT reactions, conversation_id FROM chat_messages WHERE id = $1`,
    [messageId]
  );
  if (!row) {
    return null;
  }

  let reactions: Record<string, number> = {};
  if (row.reactions) {
    if (typeof row.reactions === 'string') {
      try {
        reactions = JSON.parse(row.reactions);
      } catch {
        reactions = {};
      }
    } else if (typeof row.reactions === 'object' && row.reactions !== null) {
      reactions = { ...(row.reactions as Record<string, number>) };
    }
  }

  const currentCount = Number(reactions[emoji] ?? 0);
  if (action === 'remove') {
    const nextCount = currentCount - 1;
    if (nextCount <= 0) {
      delete reactions[emoji];
    } else {
      reactions[emoji] = nextCount;
    }
  } else {
    reactions[emoji] = currentCount + 1;
  }

  await query(
    `UPDATE chat_messages SET reactions = $1 WHERE id = $2`,
    [JSON.stringify(reactions), messageId]
  );

  return { reactions, conversationId: String(row.conversation_id) };
}

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
  let accessToken = cookieValue(cookieHeader, 'cm_access');
  if (!accessToken) {
    const authHeader = request.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.slice(7).trim();
    }
  }
  if (!accessToken) {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      accessToken = url.searchParams.get('token');
    } catch {
      // Ignore
    }
  }
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
  if (!socket.userId || !envelope.type) {
    return;
  }

  const payload = envelope.payload ?? {};

  // 1. chat.send
  if (envelope.type === 'chat.send') {
    const conversationId = String(payload.conversationId ?? '');
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    const clientMessageId = String(payload.clientMessageId ?? '');
    const attachment = payload.attachment && typeof payload.attachment === 'object' ? payload.attachment : null;
    const bookingId = payload.bookingId ? String(payload.bookingId) : null;

    if (!conversationId || (!text && !attachment && !bookingId)) {
      return;
    }

    const messageId = `m-${randomBytes(6).toString('hex')}`;
    const sentAtMs = Date.now();

    try {
      await query(
        `INSERT INTO chat_messages (id, conversation_id, author_id, text, sent_at_ms, attachment, booking_id, reactions)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '{}')`,
        [
          messageId,
          conversationId,
          socket.userId,
          text,
          sentAtMs,
          attachment ? JSON.stringify(attachment) : null,
          bookingId,
        ]
      );
    } catch (error) {
      console.error('[ws:chat] failed to persist message', error);
      return;
    }

    // Ack sender with chat.ack
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'chat.ack',
          payload: { clientMessageId, messageId },
        })
      );
    }

    // Deliver to peer with chat.message including attachment and bookingId
    const delivery = JSON.stringify({
      type: 'chat.message',
      payload: {
        id: messageId,
        messageId,
        conversationId,
        authorId: socket.userId,
        text,
        sentAtMs,
        attachment,
        bookingId,
        reactions: {},
        deliveredAtMs: null,
        readAtMs: null,
      },
    });

    await deliverToPeer(socket.userId, conversationId, delivery);
    return;
  }

  // 2. chat.delivered
  if (envelope.type === 'chat.delivered') {
    const messageId = payload.messageId ? String(payload.messageId) : undefined;
    const messageIds = Array.isArray(payload.messageIds) ? (payload.messageIds as string[]) : undefined;
    const conversationId = payload.conversationId ? String(payload.conversationId) : '';
    const deliveredAtMs = typeof payload.deliveredAtMs === 'number' ? payload.deliveredAtMs : Date.now();

    if (messageId) {
      const rows = await query<Row>(
        `UPDATE chat_messages
         SET delivered_at_ms = COALESCE(delivered_at_ms, $1)
         WHERE id = $2
         RETURNING id, conversation_id, author_id, delivered_at_ms, read_at_ms`,
        [deliveredAtMs, messageId]
      );
      for (const row of rows) {
        const receipt = JSON.stringify({
          type: 'chat.receipt',
          payload: {
            messageId: String(row.id),
            conversationId: String(row.conversation_id),
            deliveredAtMs: Number(row.delivered_at_ms),
            readAtMs: row.read_at_ms != null ? Number(row.read_at_ms) : null,
          },
        });
        await deliverToPeer(socket.userId, String(row.conversation_id), receipt);
      }
    } else if (messageIds && messageIds.length > 0) {
      const rows = await query<Row>(
        `UPDATE chat_messages
         SET delivered_at_ms = COALESCE(delivered_at_ms, $1)
         WHERE id = ANY($2)
         RETURNING id, conversation_id, author_id, delivered_at_ms, read_at_ms`,
        [deliveredAtMs, messageIds]
      );
      for (const row of rows) {
        const receipt = JSON.stringify({
          type: 'chat.receipt',
          payload: {
            messageId: String(row.id),
            conversationId: String(row.conversation_id),
            deliveredAtMs: Number(row.delivered_at_ms),
            readAtMs: row.read_at_ms != null ? Number(row.read_at_ms) : null,
          },
        });
        await deliverToPeer(socket.userId, String(row.conversation_id), receipt);
      }
    } else if (conversationId) {
      const receipt = JSON.stringify({
        type: 'chat.receipt',
        payload: {
          messageId: null,
          conversationId,
          deliveredAtMs,
          readAtMs: null,
        },
      });
      await deliverToPeer(socket.userId, conversationId, receipt);
    }
    return;
  }

  // 3. chat.read
  if (envelope.type === 'chat.read') {
    const messageId = payload.messageId ? String(payload.messageId) : undefined;
    const messageIds = Array.isArray(payload.messageIds) ? (payload.messageIds as string[]) : undefined;
    const conversationId = payload.conversationId ? String(payload.conversationId) : '';
    const readAtMs = typeof payload.readAtMs === 'number' ? payload.readAtMs : Date.now();

    if (messageId) {
      const rows = await query<Row>(
        `UPDATE chat_messages
         SET read_at_ms = COALESCE(read_at_ms, $1),
             delivered_at_ms = COALESCE(delivered_at_ms, $1)
         WHERE id = $2
         RETURNING id, conversation_id, author_id, delivered_at_ms, read_at_ms`,
        [readAtMs, messageId]
      );
      for (const row of rows) {
        const receipt = JSON.stringify({
          type: 'chat.receipt',
          payload: {
            messageId: String(row.id),
            conversationId: String(row.conversation_id),
            deliveredAtMs: Number(row.delivered_at_ms),
            readAtMs: Number(row.read_at_ms),
          },
        });
        await deliverToPeer(socket.userId, String(row.conversation_id), receipt);
      }
    } else if (messageIds && messageIds.length > 0) {
      const rows = await query<Row>(
        `UPDATE chat_messages
         SET read_at_ms = COALESCE(read_at_ms, $1),
             delivered_at_ms = COALESCE(delivered_at_ms, $1)
         WHERE id = ANY($2)
         RETURNING id, conversation_id, author_id, delivered_at_ms, read_at_ms`,
        [readAtMs, messageIds]
      );
      for (const row of rows) {
        const receipt = JSON.stringify({
          type: 'chat.receipt',
          payload: {
            messageId: String(row.id),
            conversationId: String(row.conversation_id),
            deliveredAtMs: Number(row.delivered_at_ms),
            readAtMs: Number(row.read_at_ms),
          },
        });
        await deliverToPeer(socket.userId, String(row.conversation_id), receipt);
      }
    } else if (conversationId) {
      const rows = await query<Row>(
        `UPDATE chat_messages
         SET read_at_ms = COALESCE(read_at_ms, $1),
             delivered_at_ms = COALESCE(delivered_at_ms, $1)
         WHERE (conversation_id = $2
                OR (conversation_id = $3 AND author_id = $2)
                OR (conversation_id = $2 AND author_id != $3))
           AND author_id != $3
           AND read_at_ms IS NULL
         RETURNING id, conversation_id, author_id, delivered_at_ms, read_at_ms`,
        [readAtMs, conversationId, socket.userId]
      );
      if (rows.length > 0) {
        for (const row of rows) {
          const receipt = JSON.stringify({
            type: 'chat.receipt',
            payload: {
              messageId: String(row.id),
              conversationId: String(row.conversation_id),
              deliveredAtMs: Number(row.delivered_at_ms),
              readAtMs: Number(row.read_at_ms),
            },
          });
          await deliverToPeer(socket.userId, String(row.conversation_id), receipt);
        }
      } else {
        const receipt = JSON.stringify({
          type: 'chat.receipt',
          payload: {
            messageId: null,
            conversationId,
            deliveredAtMs: readAtMs,
            readAtMs,
          },
        });
        await deliverToPeer(socket.userId, conversationId, receipt);
      }
    }
    return;
  }

  // 4. chat.typing
  if (envelope.type === 'chat.typing') {
    const conversationId = String(payload.conversationId ?? '');
    const isTyping = payload.isTyping !== undefined ? Boolean(payload.isTyping) : Boolean(payload.typing);
    if (!conversationId) {
      return;
    }
    const typingMsg = JSON.stringify({
      type: 'chat.typing',
      payload: {
        conversationId,
        typingUserId: socket.userId,
        userId: socket.userId,
        isTyping,
        typing: isTyping,
      },
    });
    await deliverToPeer(socket.userId, conversationId, typingMsg);
    return;
  }

  // 5. chat.reaction
  if (envelope.type === 'chat.reaction') {
    const messageId = String(payload.messageId ?? '');
    let conversationId = String(payload.conversationId ?? '');
    const emoji = String(payload.emoji ?? '');
    const action = payload.action === 'remove' ? 'remove' : 'add';

    if (!messageId || !emoji) {
      return;
    }

    const res = await applyReaction(messageId, emoji, action);
    if (!res) {
      return;
    }
    if (!conversationId) {
      conversationId = res.conversationId;
    }

    const reactionMsg = JSON.stringify({
      type: 'chat.reaction',
      payload: {
        messageId,
        conversationId,
        reactions: res.reactions,
        emoji,
        action,
      },
    });

    await deliverToPeer(socket.userId, conversationId, reactionMsg, true);
    return;
  }
}