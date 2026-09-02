import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import * as i0 from "@angular/core";
/** Default factory — kept separate so tests can inject a fake WebSocket. */
export const browserSocketFactory = (url) => new WebSocket(url);
/**
 * Thin RxJS wrapper over the browser WebSocket with automatic reconnection.
 */
export class WebSocketClient {
    _messages = new Subject();
    _connected = new BehaviorSubject(false);
    socket = null;
    url = '';
    manualClose = false;
    reconnectAttempts = 0;
    reconnectTimer = null;
    messages$ = this._messages.asObservable();
    connected$ = this._connected.asObservable();
    /** Overridable in tests to inject a fake WebSocket. */
    socketFactory = browserSocketFactory;
    constructor() { }
    connect(url) {
        if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
            return;
        }
        this.url = url;
        this.manualClose = false;
        this.open();
    }
    send(envelope) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return false;
        }
        this.socket.send(JSON.stringify(envelope));
        return true;
    }
    close() {
        this.manualClose = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.socket?.close();
        this.socket = null;
        this._connected.next(false);
    }
    open() {
        let socket;
        try {
            socket = this.socketFactory(this.url);
        }
        catch {
            this._connected.next(false);
            return;
        }
        this.socket = socket;
        socket.onopen = () => {
            this.reconnectAttempts = 0;
            this._connected.next(true);
        };
        socket.onmessage = (event) => {
            try {
                const envelope = JSON.parse(String(event.data));
                this._messages.next(envelope);
            }
            catch {
                // Ignore malformed frames.
            }
        };
        socket.onerror = () => {
            // onclose always follows; reconnection is handled there.
        };
        socket.onclose = () => {
            this._connected.next(false);
            if (this.manualClose) {
                return;
            }
            // Exponential backoff, capped at 30s.
            const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
            this.reconnectAttempts += 1;
            this.reconnectTimer = setTimeout(() => this.open(), delay);
        };
    }
    static ɵfac = function WebSocketClient_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || WebSocketClient)(); };
    static ɵprov = /*@__PURE__*/ i0.ɵɵdefineInjectable({ token: WebSocketClient, factory: WebSocketClient.ɵfac, providedIn: 'root' });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(WebSocketClient, [{
        type: Injectable,
        args: [{ providedIn: 'root' }]
    }], () => [], null); })();
