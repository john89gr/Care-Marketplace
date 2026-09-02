import { isDemoMode } from './demo.mode';
export class DemoWebSocket {
    readyState = 1; // WebSocket.OPEN
    url = '';
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;
    constructor(url) {
        this.url = url;
        queueMicrotask(() => {
            if (this.readyState === 1) {
                this.onopen?.(new Event('open'));
            }
        });
    }
    send(data) {
        let frame;
        try {
            frame = JSON.parse(data);
        }
        catch {
            return;
        }
        const { type, payload } = frame;
        if (type === 'chat.send' && payload) {
            const conversationId = String(payload['conversationId']);
            const clientMessageId = String(payload['clientMessageId']);
            this.deliver({ type: 'chat.ack', payload: { clientMessageId } });
            this.deliver({
                type: 'chat.message',
                payload: {
                    conversationId,
                    authorId: conversationId,
                    text: 'Bonjour ! Je suis disponible pour cette visite. On se confirme ?',
                    sentAtMs: Date.now(),
                },
            });
        }
        else if (type === 'visit.position') {
            // Broadcast the position back so listeners (family view) receive it.
            this.deliver({ type: 'visit.position', payload });
        }
    }
    close() {
        this.readyState = 3; // WebSocket.CLOSED
        this.onclose?.(new CloseEvent('close'));
    }
    deliver(frame) {
        this.onmessage?.({ data: JSON.stringify(frame) });
    }
}
export const demoSocketFactory = (url) => new DemoWebSocket(url);
/** The socket factory to use: demo stand-in when demo mode is on. */
export function socketFactoryForMode() {
    return isDemoMode() ? demoSocketFactory : (url) => new WebSocket(url);
}
