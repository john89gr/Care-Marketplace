import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import { bootstrapDb, pool, query } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';
import { attachWebSockets } from '../src/ws';

let baseUrl: string;
let wsBaseUrl: string;
let server: ReturnType<typeof createServer>;

let clientAgent: request.Agent;
let clientCookie: string;
let clientToken: string;

let providerAgent: request.Agent;
let providerCookie: string;
let providerToken: string;

async function login(email: string): Promise<{ agent: request.Agent; cookie: string; token: string }> {
  const agent = request.agent(baseUrl);
  const res = await agent.post('/api/auth/login').send({ email, password: 'demo1234' }).expect(200);
  const setCookies = res.headers['set-cookie'] ?? [];
  const cookie = setCookies.join('; ');
  let token = '';
  for (const part of setCookies) {
    if (part.startsWith('cm_access=')) {
      token = part.split(';')[0].split('=')[1];
    }
  }
  return { agent, cookie, token };
}

function openWebSocket(path: string, cookie: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBaseUrl}${path}`, {
      headers: { Cookie: cookie },
    });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForEnvelope(ws: WebSocket, type: string, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error(`Timed out waiting for envelope type '${type}'`));
    }, timeoutMs);

    const onMsg = (data: unknown) => {
      try {
        const envelope = JSON.parse(String(data));
        if (envelope.type === type) {
          clearTimeout(timer);
          ws.off('message', onMsg);
          resolve(envelope.payload);
        }
      } catch {
        // Ignore unparseable frames
      }
    };

    ws.on('message', onMsg);
  });
}

beforeAll(async () => {
  await bootstrapDb();
  await seed();
  // Clear any existing chat messages so the tests start with a clean slate
  await query(`DELETE FROM chat_messages`);

  const app = createApp();
  server = createServer(app);
  attachWebSockets(server);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  baseUrl = `http://localhost:${port}`;
  wsBaseUrl = `ws://localhost:${port}`;

  const clientAuth = await login('maria@example.com');
  clientAgent = clientAuth.agent;
  clientCookie = clientAuth.cookie;
  clientToken = clientAuth.token;

  const providerAuth = await login('nikos@example.com');
  providerAgent = providerAuth.agent;
  providerCookie = providerAuth.cookie;
  providerToken = providerAuth.token;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

describe('Chat REST API', () => {
  it('enforces authentication on all chat endpoints', async () => {
    const unauthed = request(baseUrl);
    await unauthed.get('/api/chat/conversations').expect(401);
    await unauthed.get('/api/chat/messages/some-conv').expect(401);
    await unauthed.post('/api/chat/conversations/some-conv/read').expect(401);
    await unauthed.post('/api/chat/messages/some-msg/reaction').send({ emoji: '👍' }).expect(401);
  });

  it('persists a message with attachment and bookingId directly into chat_messages and fetches it', async () => {
    const messageId = 'm-test-persist-1';
    const sentAt = Date.now() - 10000;
    const attachment = {
      kind: 'image',
      url: '/api/uploads/photo1.jpg',
      name: 'wound-photo.jpg',
      sizeMs: 1048576,
    };

    await query(
      `INSERT INTO chat_messages (id, conversation_id, author_id, text, sent_at_ms, attachment, booking_id, reactions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '{}')`,
      [messageId, 'u-nikos', 'u-client', 'Please check this attachment.', sentAt, JSON.stringify(attachment), 'b-seed-1']
    );

    const res = await clientAgent.get('/api/chat/messages/u-nikos').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);

    const msg = res.body[0];
    expect(msg.id).toBe(messageId);
    expect(msg.conversationId).toBe('u-nikos');
    expect(msg.authorId).toBe('u-client');
    expect(msg.text).toBe('Please check this attachment.');
    expect(msg.attachment).toEqual(attachment);
    expect(msg.bookingId).toBe('b-seed-1');
    expect(msg.deliveredAtMs).toBeNull();
    expect(msg.readAtMs).toBeNull();
    expect(msg.reactions).toEqual({});
    expect(msg.status).toBe('sent');
  });

  it('lists conversations with peer details, last message, and unread count', async () => {
    // Current state: client (u-client) sent 1 message to provider (u-nikos).
    // From provider's perspective:
    const providerConvs = await providerAgent.get('/api/chat/conversations').expect(200);
    expect(Array.isArray(providerConvs.body)).toBe(true);
    expect(providerConvs.body.length).toBeGreaterThanOrEqual(1);

    const conv = providerConvs.body.find((c: any) => c.peerId === 'u-client');
    expect(conv).toBeDefined();
    expect(conv.peerName).toBe('Maria Papadopoulou');
    expect(conv.peerRole).toBe('client');
    expect(conv.unreadCount).toBe(1);
    expect(conv.lastMessage).toMatchObject({
      text: 'Please check this attachment.',
      status: 'sent',
    });

    // From client's perspective:
    const clientConvs = await clientAgent.get('/api/chat/conversations').expect(200);
    const clientConv = clientConvs.body.find((c: any) => c.peerId === 'u-nikos');
    expect(clientConv).toBeDefined();
    expect(clientConv.peerName).toBe('Nikos Georgiou');
    expect(clientConv.peerRole).toBe('caregiver');
    expect(clientConv.unreadCount).toBe(0); // client is the author, so 0 unread for client
  });

  it('marks conversation messages as read via POST /api/chat/conversations/:conversationId/read', async () => {
    // Provider marks client's messages as read
    const readRes = await providerAgent.post('/api/chat/conversations/u-client/read').expect(200);
    expect(readRes.body.ok).toBe(true);
    expect(readRes.body.readCount).toBe(1);
    expect(typeof readRes.body.readAtMs).toBe('number');

    // Provider conversations should now show unreadCount = 0 and status = 'read'
    const providerConvs = await providerAgent.get('/api/chat/conversations').expect(200);
    const conv = providerConvs.body.find((c: any) => c.peerId === 'u-client');
    expect(conv.unreadCount).toBe(0);
    expect(conv.lastMessage.status).toBe('read');

    // Messages endpoint should now return readAtMs and deliveredAtMs
    const messagesRes = await providerAgent.get('/api/chat/messages/u-client').expect(200);
    expect(messagesRes.body[0].readAtMs).not.toBeNull();
    expect(messagesRes.body[0].deliveredAtMs).not.toBeNull();
    expect(messagesRes.body[0].status).toBe('read');
  });

  it('adds and removes emoji reactions via POST /api/chat/messages/:id/reaction', async () => {
    const msgId = 'm-test-persist-1';

    // Validation: missing emoji
    await providerAgent.post(`/api/chat/messages/${msgId}/reaction`).send({}).expect(400);

    // Non-existent message
    await providerAgent.post('/api/chat/messages/non-existent/reaction').send({ emoji: '👍' }).expect(404);

    // Add 👍 reaction
    const add1 = await providerAgent
      .post(`/api/chat/messages/${msgId}/reaction`)
      .send({ emoji: '👍', action: 'add' })
      .expect(200);
    expect(add1.body.reactions).toEqual({ '👍': 1 });

    // Add another 👍 reaction (increments count)
    const add2 = await clientAgent
      .post(`/api/chat/messages/${msgId}/reaction`)
      .send({ emoji: '👍', action: 'add' })
      .expect(200);
    expect(add2.body.reactions).toEqual({ '👍': 2 });

    // Add ❤️ reaction
    const addHeart = await providerAgent
      .post(`/api/chat/messages/${msgId}/reaction`)
      .send({ emoji: '❤️', action: 'add' })
      .expect(200);
    expect(addHeart.body.reactions).toEqual({ '👍': 2, '❤️': 1 });

    // Check GET messages reflects reactions
    const messagesRes = await clientAgent.get('/api/chat/messages/u-nikos').expect(200);
    expect(messagesRes.body[0].reactions).toEqual({ '👍': 2, '❤️': 1 });

    // Remove ❤️ reaction
    const removeHeart = await providerAgent
      .post(`/api/chat/messages/${msgId}/reaction`)
      .send({ emoji: '❤️', action: 'remove' })
      .expect(200);
    expect(removeHeart.body.reactions).toEqual({ '👍': 2 });

    // Remove 👍 reaction twice
    await clientAgent.post(`/api/chat/messages/${msgId}/reaction`).send({ emoji: '👍', action: 'remove' }).expect(200);
    const removeLast = await providerAgent
      .post(`/api/chat/messages/${msgId}/reaction`)
      .send({ emoji: '👍', action: 'remove' })
      .expect(200);
    expect(removeLast.body.reactions).toEqual({});
  });

  it('orders messages chronologically (newest last)', async () => {
    const convId = 'conv-order-test';
    const now = Date.now();

    await query(
      `INSERT INTO chat_messages (id, conversation_id, author_id, text, sent_at_ms, reactions)
       VALUES ('m-ord-2', $1, 'u-client', 'Second message', $2, '{}'),
              ('m-ord-1', $1, 'u-client', 'First message', $3, '{}'),
              ('m-ord-3', $1, 'u-nikos', 'Third message', $4, '{}')`,
      [convId, now - 1000, now - 2000, now]
    );

    const res = await clientAgent.get(`/api/chat/messages/${convId}`).expect(200);
    expect(res.body.map((m: any) => m.id)).toEqual(['m-ord-1', 'm-ord-2', 'm-ord-3']);
  });
});

describe('Chat v2 WebSocket Protocol', () => {
  let clientWs: WebSocket;
  let providerWs: WebSocket;

  beforeAll(async () => {
    clientWs = await openWebSocket('/api/ws/chat', clientCookie);
    providerWs = await openWebSocket('/api/ws/chat', providerCookie);
  });

  afterAll(() => {
    clientWs.close();
    providerWs.close();
  });

  it('handles chat.send: acks sender, delivers to peer, and persists to DB', async () => {
    const clientMessageId = `cmsg-${Date.now()}`;
    const attachment = {
      kind: 'pdf',
      url: '/api/uploads/care-plan.pdf',
      name: 'care-plan.pdf',
      sizeMs: 500000,
    };
    const bookingId = 'b-ws-test';

    const ackPromise = waitForEnvelope(clientWs, 'chat.ack');
    const deliveryPromise = waitForEnvelope(providerWs, 'chat.message');

    clientWs.send(
      JSON.stringify({
        type: 'chat.send',
        payload: {
          conversationId: 'u-nikos',
          text: 'Here is your care plan PDF.',
          clientMessageId,
          attachment,
          bookingId,
        },
      })
    );

    const [ack, delivery] = await Promise.all([ackPromise, deliveryPromise]);

    // Check sender ack
    expect(ack.clientMessageId).toBe(clientMessageId);
    expect(typeof ack.messageId).toBe('string');

    // Check peer delivery
    expect(delivery.authorId).toBe('u-client');
    expect(delivery.conversationId).toBe('u-nikos');
    expect(delivery.text).toBe('Here is your care plan PDF.');
    expect(delivery.attachment).toEqual(attachment);
    expect(delivery.bookingId).toBe(bookingId);
    expect(delivery.id).toBe(ack.messageId);

    // Verify persisted in DB
    const dbRow = await query<{ text: string; attachment: any; booking_id: string }>(
      `SELECT text, attachment, booking_id FROM chat_messages WHERE id = $1`,
      [ack.messageId]
    );
    expect(dbRow.length).toBe(1);
    expect(dbRow[0].text).toBe('Here is your care plan PDF.');
    expect(dbRow[0].booking_id).toBe(bookingId);
    expect(typeof dbRow[0].attachment === 'string' ? JSON.parse(dbRow[0].attachment) : dbRow[0].attachment).toEqual(
      attachment
    );
  });

  it('handles chat.delivered and chat.read: updates timestamps and broadcasts chat.receipt to peer', async () => {
    // First send a message to get a fresh messageId
    const cmsg = `cmsg-receipt-${Date.now()}`;
    const ackPromise = waitForEnvelope(clientWs, 'chat.ack');
    const msgPromise = waitForEnvelope(providerWs, 'chat.message');

    clientWs.send(
      JSON.stringify({
        type: 'chat.send',
        payload: {
          conversationId: 'u-nikos',
          text: 'Testing receipts',
          clientMessageId: cmsg,
        },
      })
    );

    const [ack] = await Promise.all([ackPromise, msgPromise]);
    const messageId = ack.messageId;

    // Provider sends chat.delivered
    const clientDeliveredReceipt = waitForEnvelope(clientWs, 'chat.receipt');
    providerWs.send(
      JSON.stringify({
        type: 'chat.delivered',
        payload: {
          messageId,
          conversationId: 'u-client',
          deliveredAtMs: 12345000,
        },
      })
    );

    const delReceipt = await clientDeliveredReceipt;
    expect(delReceipt.messageId).toBe(messageId);
    expect(delReceipt.deliveredAtMs).toBe(12345000);

    // Verify DB updated
    const rowDel = await query<{ delivered_at_ms: string }>(
      `SELECT delivered_at_ms FROM chat_messages WHERE id = $1`,
      [messageId]
    );
    expect(Number(rowDel[0].delivered_at_ms)).toBe(12345000);

    // Provider sends chat.read
    const clientReadReceipt = waitForEnvelope(clientWs, 'chat.receipt');
    providerWs.send(
      JSON.stringify({
        type: 'chat.read',
        payload: {
          messageId,
          conversationId: 'u-client',
          readAtMs: 12346000,
        },
      })
    );

    const rdReceipt = await clientReadReceipt;
    expect(rdReceipt.messageId).toBe(messageId);
    expect(rdReceipt.readAtMs).toBe(12346000);

    // Verify DB updated
    const rowRead = await query<{ read_at_ms: string }>(`SELECT read_at_ms FROM chat_messages WHERE id = $1`, [
      messageId,
    ]);
    expect(Number(rowRead[0].read_at_ms)).toBe(12346000);
  });

  it('handles chat.typing: broadcasts { conversationId, typingUserId, isTyping } to peer', async () => {
    const typingPromise = waitForEnvelope(providerWs, 'chat.typing');

    clientWs.send(
      JSON.stringify({
        type: 'chat.typing',
        payload: {
          conversationId: 'u-nikos',
          isTyping: true,
        },
      })
    );

    const typingPayload = await typingPromise;
    expect(typingPayload.conversationId).toBe('u-nikos');
    expect(typingPayload.typingUserId).toBe('u-client');
    expect(typingPayload.isTyping).toBe(true);

    // Stop typing
    const stopTypingPromise = waitForEnvelope(providerWs, 'chat.typing');
    clientWs.send(
      JSON.stringify({
        type: 'chat.typing',
        payload: {
          conversationId: 'u-nikos',
          isTyping: false,
        },
      })
    );

    const stopPayload = await stopTypingPromise;
    expect(stopPayload.isTyping).toBe(false);
  });

  it('handles chat.reaction: updates JSONB reactions column and broadcasts to peers', async () => {
    // Send a message first
    const cmsg = `cmsg-react-${Date.now()}`;
    const ackPromise = waitForEnvelope(clientWs, 'chat.ack');
    const msgPromise = waitForEnvelope(providerWs, 'chat.message');

    clientWs.send(
      JSON.stringify({
        type: 'chat.send',
        payload: {
          conversationId: 'u-nikos',
          text: 'React to me!',
          clientMessageId: cmsg,
        },
      })
    );

    const [ack] = await Promise.all([ackPromise, msgPromise]);
    const messageId = ack.messageId;

    // Provider reacts with 👍
    const clientReactionPromise = waitForEnvelope(clientWs, 'chat.reaction');
    providerWs.send(
      JSON.stringify({
        type: 'chat.reaction',
        payload: {
          messageId,
          conversationId: 'u-client',
          emoji: '🎉',
          action: 'add',
        },
      })
    );

    const reactionPayload = await clientReactionPromise;
    expect(reactionPayload.messageId).toBe(messageId);
    expect(reactionPayload.reactions).toEqual({ '🎉': 1 });

    // Verify DB updated
    const dbRow = await query<{ reactions: any }>(`SELECT reactions FROM chat_messages WHERE id = $1`, [messageId]);
    const reactions = typeof dbRow[0].reactions === 'string' ? JSON.parse(dbRow[0].reactions) : dbRow[0].reactions;
    expect(reactions).toEqual({ '🎉': 1 });
  });
});
