import { Injectable, inject, signal, computed } from '@angular/core';
import { SessionStore } from '../../core/auth/session';
import { WebSocketClient } from '../../core/services/ws/websocket.client';
import * as i0 from "@angular/core";
import * as i1 from "../../core/auth/session";
import * as i2 from "../../core/services/ws/websocket.client";
const STORAGE_KEY = 'cm.chat.v1';
const WS_URL = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws/chat`;
/**
 * Chat state (PLAN.md §5 Phase 1 — Chat): real-time WebSocket sync, unread
 * counters, and localStorage persistence. Conversations are keyed by the
 * peer's user id; incoming messages bump unread until the conversation is
 * opened.
 */
export class ChatStore {
    session;
    ws;
    // Default-parameter injection keeps `new ChatStore(session, ws)` possible in
    // unit tests while remaining DI-friendly in the app.
    constructor(session = inject(SessionStore), ws = inject(WebSocketClient)) {
        this.session = session;
        this.ws = ws;
        this._hydrate();
        this.ws.messages$.subscribe((envelope) => this.handleEnvelope(envelope));
        this.ws.connected$.subscribe((connected) => this._connected.set(connected));
    }
    _conversations = signal([], /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_conversations" }] : /* istanbul ignore next */ []));
    _messages = signal({}, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_messages" }] : /* istanbul ignore next */ []));
    _activeId = signal(null, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_activeId" }] : /* istanbul ignore next */ []));
    _connected = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_connected" }] : /* istanbul ignore next */ []));
    _sendError = signal('', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "_sendError" }] : /* istanbul ignore next */ []));
    conversations = this._conversations.asReadonly();
    messages = this._messages.asReadonly();
    activeId = this._activeId.asReadonly();
    connected = this._connected.asReadonly();
    sendError = this._sendError.asReadonly();
    totalUnread = computed(() => this._conversations().reduce((sum, c) => sum + c.unread, 0), /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "totalUnread" }] : /* istanbul ignore next */ []));
    activeMessages = computed(() => {
        const id = this._activeId();
        return id ? this._messages()[id] ?? [] : [];
    }, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "activeMessages" }] : /* istanbul ignore next */ []));
    connect() {
        this.ws.connect(WS_URL());
    }
    disconnect() {
        this.ws.close();
    }
    /** Opens (or creates) a conversation and marks it read. */
    openConversation(id, displayName = id) {
        this._activeId.set(id);
        const existing = this._conversations().find((c) => c.id === id);
        if (!existing) {
            this._conversations.update((list) => [
                { id, displayName, lastMessageAtMs: 0, unread: 0 },
                ...list,
            ]);
        }
        else if (existing.displayName !== displayName) {
            this._conversations.update((list) => list.map((c) => (c.id === id ? { ...c, displayName } : c)));
        }
        this.markRead(id);
    }
    markRead(id) {
        this._conversations.update((list) => list.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
        this._persist();
    }
    send(text) {
        const conversationId = this._activeId();
        if (!conversationId || !text.trim()) {
            return;
        }
        const me = this.session.session();
        if (!me) {
            return;
        }
        const message = {
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
        }
        else {
            this._sendError.set('');
        }
    }
    /** Handles envelopes from the chat WebSocket. */
    handleEnvelope(envelope) {
        switch (envelope.type) {
            case 'chat.message': {
                const payload = envelope.payload;
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
                const payload = envelope.payload;
                if (payload?.clientMessageId) {
                    this.updateStatus(payload.clientMessageId, 'sent');
                }
                break;
            }
        }
    }
    appendMessage(message) {
        this._messages.update((all) => ({
            ...all,
            [message.conversationId]: [...(all[message.conversationId] ?? []), message],
        }));
        this._touchConversation(message.conversationId, message.sentAtMs);
        this._persist();
    }
    updateStatus(messageId, status) {
        this._messages.update((all) => {
            const next = {};
            for (const [id, list] of Object.entries(all)) {
                next[id] = list.map((m) => (m.id === messageId ? { ...m, status } : m));
            }
            return next;
        });
        this._persist();
    }
    _touchConversation(id, sentAtMs) {
        this._conversations.update((list) => {
            const existing = list.find((c) => c.id === id);
            const updated = existing
                ? list.map((c) => (c.id === id ? { ...c, lastMessageAtMs: sentAtMs } : c))
                : [{ id, displayName: id, lastMessageAtMs: sentAtMs, unread: 0 }, ...list];
            return updated.sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs);
        });
    }
    _bumpUnread(conversationId) {
        if (this._activeId() === conversationId) {
            return;
        }
        this._conversations.update((list) => list.map((c) => (c.id === conversationId ? { ...c, unread: c.unread + 1 } : c)));
        this._persist();
    }
    _persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                conversations: this._conversations(),
                messages: this._messages(),
            }));
        }
        catch {
            // Storage unavailable — state stays in memory only.
        }
    }
    _hydrate() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.conversations)) {
                this._conversations.set(parsed.conversations.filter((c) => c && typeof c.id === 'string'));
            }
            if (parsed.messages && typeof parsed.messages === 'object') {
                this._messages.set(parsed.messages);
            }
        }
        catch {
            // Corrupted storage — start clean.
        }
    }
    static ɵfac = function ChatStore_Factory(__ngFactoryType__) { /* @ts-ignore */
    return new (__ngFactoryType__ || ChatStore)(i0.ɵɵinject(i1.SessionStore), i0.ɵɵinject(i2.WebSocketClient)); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: ChatStore, factory: ChatStore.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(ChatStore, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], () => [{ type: i1.SessionStore }, { type: i2.WebSocketClient }], null); })();
