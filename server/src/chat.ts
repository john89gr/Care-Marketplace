import { Router, Request, Response, NextFunction } from 'express';
import { query, queryOne, Row } from './db';
import { requireAuth, AuthedUser } from './auth';
import { applyReaction, deliverToPeer, sendToUser } from './ws';

export const chatRouter = Router();

export function chatMessageFromRow(row: Row) {
  let attachment = null;
  if (row.attachment) {
    attachment = typeof row.attachment === 'string' ? JSON.parse(row.attachment) : row.attachment;
  }
  let reactions: Record<string, number> = {};
  if (row.reactions) {
    reactions = typeof row.reactions === 'string' ? JSON.parse(row.reactions) : (row.reactions as Record<string, number>);
  }
  const sentAtMs = Number(row.sent_at_ms);
  const deliveredAtMs = row.delivered_at_ms != null ? Number(row.delivered_at_ms) : null;
  const readAtMs = row.read_at_ms != null ? Number(row.read_at_ms) : null;
  const status = readAtMs ? 'read' : deliveredAtMs ? 'delivered' : 'sent';

  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    authorId: String(row.author_id),
    text: String(row.text ?? ''),
    sentAtMs,
    status,
    attachment,
    bookingId: row.booking_id ? String(row.booking_id) : null,
    deliveredAtMs,
    readAtMs,
    reactions,
  };
}

/**
 * GET /api/chat/conversations
 * Returns all conversations for current user with peer details (peerId, peerName, peerRole),
 * last message (text, sentAtMs, status), unread count.
 */
chatRouter.get('/chat/conversations', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = (req.user as AuthedUser).userId;

    const rows = await query<Row>(
      `SELECT * FROM chat_messages
       WHERE author_id = $1
          OR conversation_id = $1
          OR conversation_id LIKE '%' || $1 || '%'
          OR conversation_id IN (SELECT DISTINCT conversation_id FROM chat_messages WHERE author_id = $1)
       ORDER BY sent_at_ms ASC`,
      [me]
    );

    interface ConvGroup {
      conversationId: string;
      peerId: string;
      messages: Row[];
    }

    const groups = new Map<string, ConvGroup>();

    for (const row of rows) {
      const convId = String(row.conversation_id);
      const authorId = String(row.author_id);
      let peerId = '';

      if (convId.includes(':')) {
        const parts = convId.split(':');
        peerId = parts[0] === me ? parts[1] : parts[0];
      } else if (convId === me) {
        peerId = authorId;
      } else if (authorId === me) {
        peerId = convId;
      } else {
        peerId = authorId;
      }

      const isPeerIdConv = convId === peerId || convId === me;
      const groupKey = isPeerIdConv ? peerId : convId;

      let group = groups.get(groupKey);
      if (!group) {
        group = {
          conversationId: groupKey,
          peerId: peerId || groupKey,
          messages: [],
        };
        groups.set(groupKey, group);
      } else if ((!group.peerId || group.peerId === me) && peerId && peerId !== me) {
        group.peerId = peerId;
      }
      group.messages.push(row);
    }

    for (const group of groups.values()) {
      if (!group.peerId || group.peerId === me) {
        const otherMsg = group.messages.find((m) => String(m.author_id) !== me);
        if (otherMsg) {
          group.peerId = String(otherMsg.author_id);
        } else {
          const withBooking = group.messages.find((m) => m.booking_id);
          if (withBooking?.booking_id) {
            const booking = await queryOne<Row>(
              `SELECT client_id, caregiver_id FROM bookings WHERE id = $1`,
              [withBooking.booking_id]
            );
            if (booking) {
              group.peerId = booking.client_id === me ? String(booking.caregiver_id) : String(booking.client_id);
            }
          }
          if (!group.peerId || group.peerId === me) {
            group.peerId = group.conversationId;
          }
        }
      }
    }

    const peerIds = Array.from(new Set(Array.from(groups.values()).map((g) => g.peerId)));
    const peerInfoMap = new Map<string, { displayName: string; role: string }>();

    if (peerIds.length > 0) {
      const userRows = await query<Row>(
        `SELECT id, display_name, roles FROM user_accounts WHERE id = ANY($1)`,
        [peerIds]
      );
      for (const u of userRows) {
        const roles = Array.isArray(u.roles) ? u.roles : [];
        peerInfoMap.set(String(u.id), {
          displayName: String(u.display_name ?? u.id),
          role: roles[0] ?? 'client',
        });
      }

      const caregiverRows = await query<Row>(
        `SELECT id, display_name, roles FROM caregivers WHERE id = ANY($1)`,
        [peerIds]
      );
      for (const cg of caregiverRows) {
        const roles = Array.isArray(cg.roles) ? cg.roles : [];
        const existing = peerInfoMap.get(String(cg.id));
        peerInfoMap.set(String(cg.id), {
          displayName: String(cg.display_name ?? existing?.displayName ?? cg.id),
          role: roles[0] ?? existing?.role ?? 'caregiver',
        });
      }
    }

    const conversations = Array.from(groups.values()).map((group) => {
      const peer = peerInfoMap.get(group.peerId) ?? {
        displayName: group.peerId,
        role: 'client',
      };
      const lastMsg = group.messages[group.messages.length - 1];
      const unreadCount = group.messages.filter(
        (m) => String(m.author_id) !== me && m.read_at_ms == null
      ).length;

      const sentAtMs = lastMsg ? Number(lastMsg.sent_at_ms) : 0;
      const status = lastMsg
        ? lastMsg.read_at_ms
          ? 'read'
          : lastMsg.delivered_at_ms
          ? 'delivered'
          : 'sent'
        : 'sent';

      return {
        id: group.conversationId,
        conversationId: group.conversationId,
        peerId: group.peerId,
        peerName: peer.displayName,
        peerRole: peer.role,
        lastMessage: lastMsg
          ? {
              text: String(lastMsg.text ?? ''),
              sentAtMs,
              status,
            }
          : null,
        unreadCount,
        unread: unreadCount,
        lastMessageAtMs: sentAtMs,
        displayName: peer.displayName,
      };
    });

    conversations.sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs);

    res.json(conversations);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/chat/messages/:conversationId
 * Returns message history for conversation with attachment, bookingId, deliveredAtMs, readAtMs, reactions, newest last.
 */
chatRouter.get('/chat/messages/:conversationId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = (req.user as AuthedUser).userId;
    const conversationId = req.params.conversationId;

    const rows = await query<Row>(
      `SELECT * FROM chat_messages
       WHERE conversation_id = $1
          OR (conversation_id = $2 AND author_id = $1)
          OR (conversation_id = $1 AND author_id = $2)
          OR conversation_id = ($1 || ':' || $2)
          OR conversation_id = ($2 || ':' || $1)
       ORDER BY sent_at_ms ASC`,
      [conversationId, me]
    );

    res.json(rows.map(chatMessageFromRow));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/chat/conversations/:conversationId/read
 * Marks all unread messages as read.
 */
chatRouter.post('/chat/conversations/:conversationId/read', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = (req.user as AuthedUser).userId;
    const conversationId = req.params.conversationId;
    const now = Date.now();

    const updated = await query<Row>(
      `UPDATE chat_messages
       SET read_at_ms = COALESCE(read_at_ms, $1),
           delivered_at_ms = COALESCE(delivered_at_ms, $1)
       WHERE (conversation_id = $2
              OR (conversation_id = $3 AND author_id = $2)
              OR (conversation_id = $2 AND author_id != $3)
              OR conversation_id = ($2 || ':' || $3)
              OR conversation_id = ($3 || ':' || $2))
         AND author_id != $3
         AND read_at_ms IS NULL
       RETURNING id, conversation_id, author_id, delivered_at_ms, read_at_ms`,
      [now, conversationId, me]
    );

    for (const row of updated) {
      const receiptPayload = {
        messageId: String(row.id),
        conversationId: String(row.conversation_id),
        deliveredAtMs: Number(row.delivered_at_ms),
        readAtMs: Number(row.read_at_ms),
      };
      sendToUser(String(row.author_id), {
        type: 'chat.receipt',
        payload: receiptPayload,
      });
    }

    res.json({
      ok: true,
      conversationId,
      readCount: updated.length,
      readAtMs: now,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/chat/messages/:id/reaction
 * REST endpoint to add/remove emoji reaction.
 */
chatRouter.post('/chat/messages/:id/reaction', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const me = (req.user as AuthedUser).userId;
    const messageId = req.params.id;
    const { emoji, action } = req.body as { emoji?: string; action?: 'add' | 'remove' };

    if (!emoji || typeof emoji !== 'string' || !emoji.trim()) {
      res.status(400).json({ message: 'Emoji is required.' });
      return;
    }

    const reactionAction = action === 'remove' ? 'remove' : 'add';
    const result = await applyReaction(messageId, emoji.trim(), reactionAction);

    if (!result) {
      res.status(404).json({ message: 'Message not found.' });
      return;
    }

    const reactionMsg = JSON.stringify({
      type: 'chat.reaction',
      payload: {
        messageId,
        conversationId: result.conversationId,
        reactions: result.reactions,
        emoji: emoji.trim(),
        action: reactionAction,
      },
    });
    await deliverToPeer(me, result.conversationId, reactionMsg, true);

    res.json({
      messageId,
      conversationId: result.conversationId,
      reactions: result.reactions,
      emoji: emoji.trim(),
      action: reactionAction,
    });
  } catch (error) {
    next(error);
  }
});
